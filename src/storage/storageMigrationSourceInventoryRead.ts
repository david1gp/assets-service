import * as v from "valibot"

import type { StorageMigrationBindingSnapshot } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import { storageMediaTypeDetect } from "./storageMediaTypeDetect.js"
import type { StorageMigrationInventoryItem } from "./storageMigrationInventoryItem.js"
import { storageMigrationObjectLocationCreate } from "./storageMigrationObjectLocationCreate.js"
import type { StorageNamespace } from "./storageNamespaceSchema.js"
import type { StorageObject } from "./storageObjectSchema.js"

const namespaceRoots: Record<StorageNamespace, string> = {
  "private-staging": "private/staging",
  "private-source": "private/source",
  "public-output": "public",
}

export const storageMigrationSourceInventoryRead = async (
  adapter: StorageAdapter,
  input: { sourceBinding: StorageMigrationBindingSnapshot; maxKeys?: number },
): Promise<Result<readonly StorageMigrationInventoryItem[]>> => {
  const op = "storageMigrationSourceInventoryRead"
  if (adapter.listObjects === undefined) return resultErrorCreate(op, "Storage adapter cannot list migration objects")
  const maxKeys = input.maxKeys ?? 1000
  if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000)
    return resultErrorCreate(op, "Migration inventory page size is invalid")

  const validated = storageMigrationObjectLocationCreate({
    sourceBinding: input.sourceBinding,
    targetBinding: input.sourceBinding,
    namespace: "private-staging",
    key: "inventory-probe",
  })
  if (!validated.success) return validated

  const inventory = new Map<string, StorageMigrationInventoryItem>()
  const seenTokens = new Set<string>()
  const sourceBinding = validated.data.source.binding
  const prefix = sourceBinding.prefix.length > 0 ? `${sourceBinding.prefix}/` : ""
  let continuationToken: string | undefined
  while (true) {
    const page = await adapter.listObjects({
      bucket: sourceBinding.bucket,
      ...(prefix.length === 0 ? {} : { prefix }),
      continuationToken,
      maxKeys,
    })
    if (!page.success) return page
    for (const listed of page.data.objects) {
      const parsedKey = sourceNamespaceKeyRead(listed.key, prefix)
      if (parsedKey === null) {
        if (listed.key.startsWith(prefix))
          return resultErrorCreate(op, "Source inventory contains an unknown object", listed.key)
        continue
      }
      const locations = storageMigrationObjectLocationCreate({
        sourceBinding: input.sourceBinding,
        targetBinding: input.sourceBinding,
        namespace: parsedKey.namespace,
        key: parsedKey.key,
      })
      if (!locations.success) return locations
      if (locations.data.source.objectKey !== listed.key)
        return resultErrorCreate(op, "Source inventory contained an invalid namespace object key", listed)
      const object = await sourceObjectRead(adapter, locations.data.source, listed)
      if (!object.success) return object
      if (inventory.has(listed.key))
        return resultErrorCreate(op, "Source inventory contained a duplicate object", listed)
      inventory.set(listed.key, {
        namespace: parsedKey.namespace,
        key: parsedKey.key,
        location: locations.data.source,
        object: object.data,
      })
    }
    const next = page.data.nextContinuationToken
    if (next === null) break
    if (next === continuationToken || seenTokens.has(next))
      return resultErrorCreate(op, "Source inventory pagination did not advance")
    seenTokens.add(next)
    continuationToken = next
  }
  return {
    success: true,
    data: [...inventory.values()].toSorted((left, right) =>
      left.location.objectKey.localeCompare(right.location.objectKey),
    ),
  }
}

function sourceNamespaceKeyRead(
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

async function sourceObjectRead(
  adapter: StorageAdapter,
  location: Parameters<StorageAdapter["headObject"]>[0],
  listed: StorageObject,
): Promise<Result<StorageMigrationInventoryItem["object"]>> {
  const op = "storageMigrationSourceInventoryRead"
  const head = await adapter.headObject(location)
  if (!head.success) return head
  if (head.data === null) return resultErrorCreate(op, "Source inventory object disappeared during discovery", listed)
  if (head.data.byteSize !== listed.byteSize)
    return resultErrorCreate(op, "Source object changed during inventory discovery", { listed, head: head.data })

  let sha256 = validSha256(head.data.sha256) ? head.data.sha256 : validSha256(listed.sha256) ? listed.sha256 : undefined
  let mediaType = validMediaType(head.data.mediaType)
    ? head.data.mediaType
    : validMediaType(listed.mediaType)
      ? listed.mediaType
      : undefined
  if (sha256 !== undefined && mediaType !== undefined)
    return { success: true, data: { ...listed, ...head.data, sha256, mediaType } }

  const bytes = await adapter.readObject(location)
  if (!bytes.success) return bytes
  if (bytes.data === null) return resultErrorCreate(op, "Source object disappeared during inventory discovery", listed)
  if (bytes.data.byteLength !== listed.byteSize)
    return resultErrorCreate(op, "Source object changed during inventory discovery", listed)
  sha256 ??= contentSha256Create(bytes.data)
  if (mediaType === undefined) {
    const detected = storageMediaTypeDetect(bytes.data)
    if (!detected.success) return detected
    mediaType = detected.data
  }
  return { success: true, data: { ...listed, ...head.data, sha256, mediaType } }
}

function validSha256(value: string | undefined): value is string {
  return value !== undefined && v.safeParse(sha256Schema, value).success
}

function validMediaType(value: string | undefined): value is string {
  return value !== undefined && v.safeParse(mediaTypeSchema, value).success
}
