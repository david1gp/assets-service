import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type StorageBinding, storageBindingSchema } from "./storageBindingSchema.js"

export type StorageBucketDedication = {
  projectId: string
  bucket: string
  bindings: readonly StorageBinding[]
}

export const storageBucketDedicatedValidate = (input: {
  projectId: string
  bucket: string
  bindings: readonly StorageBinding[]
}): Result<StorageBucketDedication> => {
  const op = "storageBucketDedicatedValidate"
  if (typeof input.projectId !== "string" || input.projectId.length === 0)
    return resultErrorCreate(op, "Project id is required")
  if (typeof input.bucket !== "string" || input.bucket.length === 0) return resultErrorCreate(op, "Bucket is required")
  if (!Array.isArray(input.bindings)) return resultErrorCreate(op, "Storage bindings are required")

  const bindings: StorageBinding[] = []
  for (const binding of input.bindings) {
    const parsed = v.safeParse(storageBindingSchema, binding)
    if (!parsed.success) return resultErrorCreate(op, "A storage binding was invalid", binding)
    bindings.push(parsed.output)
  }
  const matching = bindings.filter((binding) => binding.bucket === input.bucket)
  if (matching.length === 0) return resultErrorCreate(op, "The bucket was not bound to the project")
  if (matching.some((binding) => binding.projectId !== input.projectId))
    return resultErrorCreate(op, "The bucket is shared with another project")
  if (matching.some((binding) => binding.prefix.length === 0))
    return resultErrorCreate(op, "The bucket dedication could not be proven for an empty prefix")
  return { success: true, data: { projectId: input.projectId, bucket: input.bucket, bindings: matching } }
}
