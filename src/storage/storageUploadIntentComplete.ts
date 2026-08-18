import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import { storageObjectVerify } from "./storageObjectVerify.js"
import type { StorageUploadIntent } from "./storageUploadIntentSchema.js"
import type { StorageVerification } from "./storageVerification.js"

export const storageUploadIntentComplete = async (
  adapter: StorageAdapter,
  input: {
    intent: StorageUploadIntent
    location: StorageObjectLocation & { bucket: string; objectKey: string }
    sha256: string
    now?: Date
  },
): Promise<Result<StorageVerification>> => {
  const op = "storageUploadIntentComplete"
  if (input.location.objectKey !== input.intent.key) return resultErrorCreate(op, "Upload intent key did not match")
  if (input.intent.headers["content-length"] !== String(input.intent.byteSize))
    return resultErrorCreate(op, "Upload intent did not bind the expected byte size")
  if (input.intent.headers["content-type"] !== input.intent.mediaType)
    return resultErrorCreate(op, "Upload intent did not bind the expected media type")
  if (input.intent.sha256 !== undefined && input.intent.headers["x-amz-meta-sha256"] !== input.intent.sha256)
    return resultErrorCreate(op, "Upload intent did not bind the expected checksum")
  const expectedSha = v.safeParse(sha256Schema, input.sha256)
  if (!expectedSha.success) return resultErrorCreate(op, "Upload checksum was invalid")
  if (input.intent.sha256 !== undefined && input.intent.sha256 !== expectedSha.output)
    return resultErrorCreate(op, "Upload checksum did not match the signed intent")
  const expiresAt = Date.parse(input.intent.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime())
    return resultErrorCreate(op, "Upload intent has expired")
  return storageObjectVerify(adapter, {
    location: input.location,
    byteSize: input.intent.byteSize,
    sha256: expectedSha.output,
    mediaType: input.intent.mediaType,
  })
}
