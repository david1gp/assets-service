import { contentSha256Create } from "../../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { StorageAdapter } from "../../storage/storageAdapter.js"
import type { StorageObjectLocation } from "../../storage/storageObjectLocation.js"
import type { StorageObject } from "../../storage/storageObjectSchema.js"
import { storagePublicObjectKeyValidate } from "../../storage/storagePublicObjectKeyValidate.js"
import type { StorageUploadIntent } from "../../storage/storageUploadIntentSchema.js"

type MemoryObject = StorageObject & { bytes: Uint8Array; mediaType: string }

export const memoryStorageAdapterCreate = (input: { now?: () => Date } = {}): StorageAdapter => {
  const objects = new Map<string, MemoryObject>()
  const now = input.now ?? (() => new Date())

  const locationKey = (location: StorageObjectLocation & { bucket: string; objectKey: string }): string =>
    `${location.bucket}/${location.objectKey}`

  return {
    createSignedUploadIntent: async (intentInput): Promise<Result<StorageUploadIntent>> => {
      const expiresAt = new Date((intentInput.now ?? now()).getTime() + intentInput.expiresInSeconds * 1000)
      if (intentInput.expiresInSeconds < 1 || intentInput.expiresInSeconds > 3600) {
        return resultErrorCreate(
          "memoryStorageAdapterCreate",
          "Upload intent expiry must be between 1 and 3600 seconds",
        )
      }
      return {
        success: true,
        data: {
          method: "PUT",
          url: `https://memory.invalid/${encodeURIComponent(intentInput.location.bucket)}/${intentInput.location.objectKey}?expiresAt=${encodeURIComponent(expiresAt.toISOString())}`,
          key: intentInput.location.objectKey,
          expiresAt: expiresAt.toISOString(),
          headers: {
            "content-length": String(intentInput.byteSize),
            "content-type": intentInput.mediaType,
            ...(intentInput.sha256 ? { "x-amz-meta-sha256": intentInput.sha256 } : {}),
          },
          mediaType: intentInput.mediaType,
          byteSize: intentInput.byteSize,
          ...(intentInput.sha256 ? { sha256: intentInput.sha256 } : {}),
        },
      }
    },
    headObject: async (location) => {
      const object = objects.get(locationKey(location))
      if (!object) return { success: true, data: null }
      return { success: true, data: withoutBytes(object) }
    },
    readObject: async (location) => {
      const object = objects.get(locationKey(location))
      return { success: true, data: object ? new Uint8Array(object.bytes) : null }
    },
    readObjectStream: async (location) => {
      const object = objects.get(locationKey(location))
      if (!object) return { success: true, data: null }
      const bytes = new Uint8Array(object.bytes)
      return {
        success: true,
        data: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
      }
    },
    putImmutable: async (putInput) => {
      if (putInput.location.namespace === "public-output") {
        const key = storagePublicObjectKeyValidate(putInput.location.key)
        if (!key.success) return key
      }
      const key = locationKey(putInput.location)
      if (objects.has(key)) return resultErrorCreate("memoryStorageAdapterCreate", "Storage object already exists")
      const actualSha256 = contentSha256Create(putInput.bytes)
      if (putInput.sha256 !== undefined && putInput.sha256 !== actualSha256)
        return resultErrorCreate("memoryStorageAdapterCreate", "Storage object checksum does not match the bytes")
      const sha256 = putInput.sha256 ?? actualSha256
      const object: MemoryObject = {
        key: putInput.location.objectKey,
        byteSize: putInput.bytes.byteLength,
        mediaType: putInput.mediaType,
        sha256,
        etag: sha256,
        cacheControl:
          putInput.location.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store",
        bytes: new Uint8Array(putInput.bytes),
      }
      objects.set(key, object)
      return { success: true, data: withoutBytes(object) }
    },
    copyImmutable: async (copyInput) => {
      if (copyInput.destination.namespace === "public-output") {
        const key = storagePublicObjectKeyValidate(copyInput.destination.key)
        if (!key.success) return key
      }
      const source = objects.get(locationKey(copyInput.source))
      if (!source) return resultErrorCreate("memoryStorageAdapterCreate", "Source storage object does not exist")
      if (copyInput.sha256 !== undefined && copyInput.sha256 !== source.sha256)
        return resultErrorCreate("memoryStorageAdapterCreate", "Copied object checksum does not match the source")
      const destinationKey = locationKey(copyInput.destination)
      if (objects.has(destinationKey))
        return resultErrorCreate("memoryStorageAdapterCreate", "Storage object already exists")
      const object: MemoryObject = {
        ...source,
        key: copyInput.destination.objectKey,
        mediaType: copyInput.mediaType ?? source.mediaType,
        sha256: copyInput.sha256 ?? source.sha256,
        cacheControl:
          copyInput.destination.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store",
        bytes: new Uint8Array(source.bytes),
      }
      objects.set(destinationKey, object)
      return { success: true, data: withoutBytes(object) }
    },
    deleteObject: async (location) => {
      objects.delete(locationKey(location))
      return { success: true, data: undefined }
    },
    listObjects: async ({ bucket, prefix, continuationToken, maxKeys }) => {
      const start = continuationToken === undefined ? 0 : Number(continuationToken)
      const limit = maxKeys ?? 1000
      if (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit < 1)
        return resultErrorCreate("memoryStorageAdapterCreate", "Storage object list pagination is invalid")
      const matches = [...objects.entries()]
        .filter(([key]) => key.startsWith(`${bucket}/`))
        .map(([, object]) => withoutBytes(object))
        .filter((object) => prefix === undefined || object.key.startsWith(prefix))
        .toSorted((left, right) => left.key.localeCompare(right.key))
      const page = matches.slice(start, start + limit)
      return {
        success: true,
        data: {
          objects: page,
          nextContinuationToken: start + limit < matches.length ? String(start + limit) : null,
        },
      }
    },
    probeCredentials: async () => ({ success: true, data: { reachable: true, status: 200 } }),
  }
}

function withoutBytes(object: MemoryObject): StorageObject {
  const { bytes: _bytes, mediaType, ...metadata } = object
  return { ...metadata, mediaType }
}
