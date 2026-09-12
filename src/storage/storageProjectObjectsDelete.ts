import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import { type StorageBinding, storageBindingSchema } from "./storageBindingSchema.js"
import type { StorageNamespace } from "./storageNamespaceSchema.js"
import { storageObjectSchema } from "./storageObjectSchema.js"

export const storageProjectObjectsDelete = async (
  adapter: StorageAdapter,
  input: { binding: StorageBinding; maxKeys?: number },
): Promise<Result<{ deletedCount: number }>> => {
  const op = "storageProjectObjectsDelete"
  const binding = v.safeParse(storageBindingSchema, input.binding)
  if (!binding.success) return resultErrorCreate(op, "Storage binding was invalid", input.binding)
  if (binding.output.prefix.length === 0)
    return resultErrorCreate(op, "Project object deletion requires a non-empty storage prefix")
  if (adapter.listObjects === undefined) return resultErrorCreate(op, "Storage adapter does not support object listing")

  const maxKeys = input.maxKeys ?? 1000
  if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000)
    return resultErrorCreate(op, "Storage object list size is invalid")
  const prefix = `${binding.output.prefix}/`
  const objects: string[] = []
  let continuationToken: string | undefined
  const seenTokens = new Set<string>()
  while (true) {
    const page = await adapter.listObjects({
      bucket: binding.output.bucket,
      prefix,
      ...(continuationToken === undefined ? {} : { continuationToken }),
      maxKeys,
    })
    if (!page.success) return page
    for (const object of page.data.objects) {
      const parsed = v.safeParse(storageObjectSchema, object)
      if (!parsed.success || !parsed.output.key.startsWith(prefix))
        return resultErrorCreate(op, "Storage listing contained an object outside the project prefix", object)
      objects.push(parsed.output.key)
    }
    const nextToken = page.data.nextContinuationToken
    if (nextToken === null) break
    if (seenTokens.has(nextToken)) return resultErrorCreate(op, "Storage object listing pagination repeated a token")
    seenTokens.add(nextToken)
    continuationToken = nextToken
  }

  let deletedCount = 0
  for (const objectKey of objects) {
    const location = storageObjectLocationRead(binding.output.prefix, objectKey)
    if (!location.success) return location
    const deleted = await adapter.deleteObject({
      binding: binding.output,
      namespace: location.data.namespace,
      key: location.data.key,
      bucket: binding.output.bucket,
      objectKey,
    })
    if (!deleted.success) return deleted
    deletedCount += 1
  }
  return { success: true, data: { deletedCount } }
}

function storageObjectLocationRead(
  prefix: string,
  objectKey: string,
): Result<{ namespace: StorageNamespace; key: string }> {
  const relative = objectKey.slice(`${prefix}/`.length)
  for (const [root, namespace] of [
    ["private/staging/", "private-staging"],
    ["private/source/", "private-source"],
    ["public/", "public-output"],
  ] as const) {
    if (relative.startsWith(root) && relative.slice(root.length).length > 0)
      return { success: true, data: { namespace, key: relative.slice(root.length) } }
  }
  return resultErrorCreate("storageProjectObjectsDelete", "Storage listing contained an unknown namespace", objectKey)
}
