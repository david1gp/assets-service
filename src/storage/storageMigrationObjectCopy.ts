import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import { storageCopyImmutable } from "./storageCopyImmutable.js"
import type { StorageMigrationInventoryItem } from "./storageMigrationInventoryItem.js"
import type { StorageObject } from "./storageObjectSchema.js"
import { storageObjectVerify } from "./storageObjectVerify.js"
import { storagePublicObjectKeyValidate } from "./storagePublicObjectKeyValidate.js"

export const storageMigrationObjectCopy = async (
  adapter: StorageAdapter,
  input: {
    source: StorageMigrationInventoryItem
    destination: Parameters<StorageAdapter["copyImmutable"]>[0]["destination"]
  },
): Promise<Result<StorageObject>> => {
  const op = "storageMigrationObjectCopy"
  if (
    input.source.location.binding.projectId !== input.destination.binding.projectId ||
    input.source.location.binding.environment !== input.destination.binding.environment ||
    input.source.location.namespace !== input.source.namespace ||
    input.source.location.key !== input.source.key ||
    input.source.namespace !== input.destination.namespace ||
    input.source.key !== input.destination.key ||
    input.source.location.objectKey !== input.source.object.key ||
    input.source.location.bucket !== input.source.location.binding.bucket
  )
    return resultErrorCreate(op, "Migration source and destination keys do not match")
  if (input.destination.namespace === "public-output") {
    const key = storagePublicObjectKeyValidate(input.destination.key)
    if (!key.success) return key
  }
  const sourceObject = input.source.object
  const sourceVerified = await storageObjectVerify(adapter, {
    location: input.source.location,
    byteSize: sourceObject.byteSize,
    sha256: sourceObject.sha256,
    mediaType: sourceObject.mediaType,
    ...(sourceObject.cacheControl === undefined ? {} : { cacheControl: sourceObject.cacheControl }),
  })
  if (!sourceVerified.success) return sourceVerified
  const expectedCacheControl = storageCacheControlRead(input.destination.namespace)
  const existing = await adapter.headObject(input.destination)
  if (!existing.success) return existing
  if (existing.data !== null) {
    const identical = await storageObjectVerify(adapter, {
      location: input.destination,
      byteSize: sourceObject.byteSize,
      sha256: sourceObject.sha256,
      mediaType: sourceObject.mediaType,
      cacheControl: expectedCacheControl,
      requireMetadata: true,
    })
    if (!identical.success)
      return resultErrorCreate(op, "Destination object collides with a different object", identical)
    return sourceStableCopyResult(adapter, input, existing.data)
  }

  const copied = await storageCopyImmutable(adapter, {
    source: input.source.location,
    destination: input.destination,
    mediaType: sourceObject.mediaType,
    sha256: sourceObject.sha256,
    ...(sourceObject.etag === undefined ? {} : { sourceEtag: sourceObject.etag }),
  })
  if (!copied.success) {
    const raced = await destinationReadIfIdentical(adapter, input.destination, sourceObject, expectedCacheControl)
    if (!raced.success) return copied
    return sourceStableCopyResult(adapter, input, raced.data)
  }
  const verified = await storageObjectVerify(adapter, {
    location: input.destination,
    byteSize: sourceObject.byteSize,
    sha256: sourceObject.sha256,
    mediaType: sourceObject.mediaType,
    cacheControl: expectedCacheControl,
    requireMetadata: true,
  })
  if (!verified.success) return verified
  return sourceStableCopyResult(adapter, input, copied.data)
}

async function destinationReadIfIdentical(
  adapter: StorageAdapter,
  location: Parameters<StorageAdapter["headObject"]>[0],
  sourceObject: StorageMigrationInventoryItem["object"],
  cacheControl: string,
): Promise<Result<StorageObject>> {
  const head = await adapter.headObject(location)
  if (!head.success) return head
  if (head.data === null) return resultErrorCreate("storageMigrationObjectCopy", "Destination object was not created")
  const verified = await storageObjectVerify(adapter, {
    location,
    byteSize: sourceObject.byteSize,
    sha256: sourceObject.sha256,
    mediaType: sourceObject.mediaType,
    cacheControl,
    requireMetadata: true,
  })
  if (!verified.success) return verified
  return { success: true, data: head.data }
}

async function sourceStableCopyResult(
  adapter: StorageAdapter,
  input: {
    source: StorageMigrationInventoryItem
    destination: Parameters<StorageAdapter["copyImmutable"]>[0]["destination"]
  },
  destination: StorageObject,
): Promise<Result<StorageObject>> {
  const source = await adapter.headObject(input.source.location)
  if (!source.success) return source
  if (source.data === null)
    return resultErrorCreate("storageMigrationObjectCopy", "Source object disappeared during copy")
  if (input.source.object.etag !== undefined && source.data.etag !== input.source.object.etag)
    return resultErrorCreate("storageMigrationObjectCopy", "Source object changed during copy")
  const stable = await storageObjectVerify(adapter, {
    location: input.source.location,
    byteSize: input.source.object.byteSize,
    sha256: input.source.object.sha256,
    mediaType: input.source.object.mediaType,
    ...(input.source.object.cacheControl === undefined ? {} : { cacheControl: input.source.object.cacheControl }),
  })
  if (!stable.success)
    return resultErrorCreate("storageMigrationObjectCopy", "Source object changed during copy", stable)
  return { success: true, data: destination }
}

function storageCacheControlRead(namespace: StorageMigrationInventoryItem["namespace"]): string {
  return namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store"
}
