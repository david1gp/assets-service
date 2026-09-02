import type { StorageMigrationBindingSnapshot } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import type { StorageMigrationDestinationInventoryVerification } from "./storageMigrationDestinationInventoryVerification.js"
import type { StorageMigrationInventoryItem } from "./storageMigrationInventoryItem.js"
import { storageMigrationObjectLocationCreate } from "./storageMigrationObjectLocationCreate.js"
import type { StorageNamespace } from "./storageNamespaceSchema.js"
import { storageObjectVerify } from "./storageObjectVerify.js"
import { storagePublicObjectKeyValidate } from "./storagePublicObjectKeyValidate.js"

const namespaceRoots: Record<StorageNamespace, string> = {
  "private-staging": "private/staging",
  "private-source": "private/source",
  "public-output": "public",
}

export const storageMigrationDestinationInventoryVerify = async (
  adapter: StorageAdapter,
  input: {
    sourceBinding: StorageMigrationBindingSnapshot
    targetBinding: StorageMigrationBindingSnapshot
    inventory: readonly StorageMigrationInventoryItem[]
    maxKeys?: number
  },
): Promise<Result<StorageMigrationDestinationInventoryVerification>> => {
  const op = "storageMigrationDestinationInventoryVerify"
  if (adapter.listObjects === undefined) return resultErrorCreate(op, "Storage adapter cannot list migration objects")
  const maxKeys = input.maxKeys ?? 1000
  if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000)
    return resultErrorCreate(op, "Migration inventory page size is invalid")
  const validated = storageMigrationObjectLocationCreate({
    sourceBinding: input.sourceBinding,
    targetBinding: input.targetBinding,
    namespace: "private-staging",
    key: "inventory-probe",
  })
  if (!validated.success) return validated

  const expected = new Map<
    string,
    { namespace: StorageNamespace; key: string; object: StorageMigrationInventoryItem["object"] }
  >()
  for (const item of input.inventory) {
    const location = storageMigrationObjectLocationCreate({
      sourceBinding: input.sourceBinding,
      targetBinding: input.targetBinding,
      namespace: item.namespace,
      key: item.key,
    })
    if (!location.success) return location
    if (
      location.data.source.objectKey !== item.location.objectKey ||
      location.data.source.bucket !== item.location.bucket ||
      location.data.source.namespace !== item.location.namespace ||
      location.data.source.key !== item.location.key ||
      location.data.source.objectKey !== item.object.key
    )
      return resultErrorCreate(op, "Source inventory does not match its binding", item)
    if (expected.has(location.data.destination.objectKey))
      return resultErrorCreate(op, "Migration inventory contains duplicate destination keys", item)
    expected.set(location.data.destination.objectKey, { namespace: item.namespace, key: item.key, object: item.object })
  }

  const actual = new Map<string, StorageNamespace>()
  const targetBinding = validated.data.destination.binding
  const prefix = targetBinding.prefix.length > 0 ? `${targetBinding.prefix}/` : ""
  const seenTokens = new Set<string>()
  let continuationToken: string | undefined
  while (true) {
    const page = await adapter.listObjects({
      bucket: targetBinding.bucket,
      ...(prefix.length === 0 ? {} : { prefix }),
      continuationToken,
      maxKeys,
    })
    if (!page.success) return page
    for (const object of page.data.objects) {
      const parsedKey = destinationNamespaceKeyRead(object.key, prefix)
      if (parsedKey === null) {
        if (object.key.startsWith(prefix))
          return resultErrorCreate(op, "Destination inventory contains an extra object", object.key)
        continue
      }
      const location = storageMigrationObjectLocationCreate({
        sourceBinding: input.sourceBinding,
        targetBinding: input.targetBinding,
        namespace: parsedKey.namespace,
        key: parsedKey.key,
      })
      if (!location.success) return location
      if (location.data.destination.objectKey !== object.key)
        return resultErrorCreate(op, "Destination inventory contained an invalid namespace object key", object)
      if (parsedKey.namespace === "public-output") {
        const key = storagePublicObjectKeyValidate(parsedKey.key)
        if (!key.success) return key
      }
      if (actual.has(object.key))
        return resultErrorCreate(op, "Destination inventory contained a duplicate object", object)
      actual.set(object.key, parsedKey.namespace)
    }
    const next = page.data.nextContinuationToken
    if (next === null) break
    if (next === continuationToken || seenTokens.has(next))
      return resultErrorCreate(op, "Destination inventory pagination did not advance")
    seenTokens.add(next)
    continuationToken = next
  }

  for (const key of expected.keys())
    if (!actual.has(key)) return resultErrorCreate(op, "Destination inventory is missing an object", key)
  for (const key of actual.keys())
    if (!expected.has(key)) return resultErrorCreate(op, "Destination inventory contains an extra object", key)
  for (const [objectKey, expectedObject] of expected) {
    const location = storageMigrationObjectLocationCreate({
      sourceBinding: input.sourceBinding,
      targetBinding: input.targetBinding,
      namespace: expectedObject.namespace,
      key: expectedObject.key,
    })
    if (!location.success) return location
    const verified = await storageObjectVerify(adapter, {
      location: location.data.destination,
      byteSize: expectedObject.object.byteSize,
      sha256: expectedObject.object.sha256,
      mediaType: expectedObject.object.mediaType,
      cacheControl: storageCacheControlRead(expectedObject.namespace),
      requireMetadata: true,
    })
    if (!verified.success) return resultErrorCreate(op, `Destination object ${objectKey} did not verify`, verified)
  }
  return {
    success: true,
    data: {
      objectCount: expected.size,
      totalBytes: [...expected.values()].reduce((total, item) => total + item.object.byteSize, 0),
    },
  }
}

function destinationNamespaceKeyRead(
  objectKey: string,
  prefix: string,
): { namespace: StorageNamespace; key: string } | null {
  if (!objectKey.startsWith(prefix)) return null
  const relative = objectKey.slice(prefix.length)
  for (const namespace of Object.keys(namespaceRoots) as StorageNamespace[]) {
    const root = `${namespaceRoots[namespace]}/`
    if (relative.startsWith(root)) return { namespace, key: relative.slice(root.length) }
  }
  return null
}

function storageCacheControlRead(namespace: StorageNamespace): string {
  return namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store"
}
