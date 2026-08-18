import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import type { StorageObject } from "./storageObjectSchema.js"
import { storagePublicObjectKeyValidate } from "./storagePublicObjectKeyValidate.js"

export const storageCopyImmutable = async (
  adapter: StorageAdapter,
  input: {
    source: StorageObjectLocation & { bucket: string; objectKey: string }
    destination: StorageObjectLocation & { bucket: string; objectKey: string }
    mediaType?: string
    sha256?: string
  },
): Promise<Result<StorageObject>> => {
  const op = "storageCopyImmutable"
  if (input.source.bucket !== input.destination.bucket)
    return resultErrorCreate(op, "Storage copies cannot cross buckets")
  if (input.source.binding.projectId !== input.destination.binding.projectId)
    return resultErrorCreate(op, "Storage copies cannot cross projects")
  if (input.destination.namespace === "public-output") {
    const key = storagePublicObjectKeyValidate(input.destination.key)
    if (!key.success) return key
  }
  return adapter.copyImmutable(input)
}
