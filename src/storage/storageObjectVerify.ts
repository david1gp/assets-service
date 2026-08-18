import * as v from "valibot"
import { documentMediaTypeSchema } from "../document/documentMediaTypeSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import { storageMediaTypeDetect } from "./storageMediaTypeDetect.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import type { StorageVerification } from "./storageVerification.js"

export const storageObjectVerify = async (
  adapter: StorageAdapter,
  input: {
    location: StorageObjectLocation & { bucket: string; objectKey: string }
    byteSize: number
    sha256: string
    mediaType: string
  },
): Promise<Result<StorageVerification>> => {
  const op = "storageObjectVerify"
  if (!Number.isInteger(input.byteSize) || input.byteSize < 0)
    return resultErrorCreate(op, "Expected object byte size was invalid")
  const expectedSha = v.safeParse(sha256Schema, input.sha256)
  if (!expectedSha.success) return resultErrorCreate(op, "Expected object checksum was invalid")
  const expectedMediaType = v.safeParse(mediaTypeSchema, input.mediaType)
  if (!expectedMediaType.success) return resultErrorCreate(op, "Expected object media type was invalid")
  const head = await adapter.headObject(input.location)
  if (!head.success) return head
  if (head.data === null) return resultErrorCreate(op, "Storage object does not exist")
  if (head.data.byteSize !== input.byteSize && head.data.byteSize !== 0)
    return resultErrorCreate(op, "Storage object byte size does not match")
  if (head.data.mediaType !== undefined && head.data.mediaType !== expectedMediaType.output)
    return resultErrorCreate(op, "Storage object metadata media type does not match")
  if (head.data.byteSize !== 0 && head.data.sha256 !== undefined && head.data.sha256 !== expectedSha.output)
    return resultErrorCreate(op, "Storage object metadata checksum does not match")

  if (head.data.byteSize === 0)
    return { success: true, data: { byteSize: input.byteSize, sha256: expectedSha.output, mediaType: expectedMediaType.output } }

  const stream = adapter.readObjectStream ? await adapter.readObjectStream(input.location) : undefined
  if (stream && !stream.success) return stream
  if (stream?.success && stream.data !== null) {
    return streamVerify(stream.data, input, expectedSha.output, expectedMediaType.output)
  }

  const read = await adapter.readObject(input.location)
  if (!read.success) return read
  if (read.data === null) return resultErrorCreate(op, "Storage object disappeared during verification")
  return bytesVerify(read.data, input, expectedSha.output, expectedMediaType.output)
}

async function streamVerify(
  stream: ReadableStream<Uint8Array>,
  input: { byteSize: number; sha256: string; mediaType: string },
  expectedSha: string,
  expectedMediaType: string,
): Promise<Result<StorageVerification>> {
  const op = "storageObjectVerify"
  const reader = stream.getReader()
  const hasher = new Bun.CryptoHasher("sha256")
  const prefix = new Uint8Array(512)
  let prefixLength = 0
  let byteSize = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const bytes = next.value
      byteSize += bytes.byteLength
      hasher.update(bytes)
      const copyLength = Math.min(bytes.byteLength, prefix.byteLength - prefixLength)
      if (copyLength > 0) prefix.set(bytes.subarray(0, copyLength), prefixLength)
      prefixLength += copyLength
    }
  } catch (error) {
    return resultErrorCreate(op, "Storage object could not be read during verification", error)
  } finally {
    reader.releaseLock()
  }
  if (byteSize !== input.byteSize) return resultErrorCreate(op, "Storage object byte size changed during verification")
  const detected = mediaTypeDetect(prefix.subarray(0, prefixLength), expectedMediaType)
  if (!detected.success) return detected
  if (detected.data !== expectedMediaType) return resultErrorCreate(op, "Storage object media type does not match")
  const sha256 = hasher.digest("hex")
  if (sha256 !== expectedSha) return resultErrorCreate(op, "Storage object checksum does not match")
  return { success: true, data: { byteSize, sha256, mediaType: detected.data } }
}

function bytesVerify(
  bytes: Uint8Array,
  input: { byteSize: number; sha256: string; mediaType: string },
  expectedSha: string,
  expectedMediaType: string,
): Result<StorageVerification> {
  const detected = mediaTypeDetect(bytes, expectedMediaType)
  if (!detected.success) return detected
  if (detected.data !== expectedMediaType)
    return resultErrorCreate("storageObjectVerify", "Storage object media type does not match")
  const sha256 = contentSha256Create(bytes)
  if (sha256 !== expectedSha) return resultErrorCreate("storageObjectVerify", "Storage object checksum does not match")
  if (bytes.byteLength !== input.byteSize)
    return resultErrorCreate("storageObjectVerify", "Storage object byte size changed during verification")
  return { success: true, data: { byteSize: bytes.byteLength, sha256, mediaType: detected.data } }
}

function mediaTypeDetect(bytes: Uint8Array, expectedMediaType: string): Result<string> {
  const document = v.safeParse(documentMediaTypeSchema, expectedMediaType)
  if (document.success) return { success: true, data: expectedMediaType }
  return storageMediaTypeDetect(bytes)
}
