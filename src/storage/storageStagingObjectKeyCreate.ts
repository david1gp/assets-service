import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageBinding } from "./storageBindingSchema.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import { storageObjectLocationCreate } from "./storageObjectLocationCreate.js"

export const storageStagingObjectKeyCreate = (
  binding: StorageBinding,
  uploadId: string,
): Result<StorageObjectLocation & { bucket: string; objectKey: string }> => {
  const parsed = v.safeParse(idSchema, uploadId)
  if (!parsed.success) return resultErrorCreate("storageStagingObjectKeyCreate", "Upload id is invalid", uploadId)
  return storageObjectLocationCreate(binding, "private-staging", `uploads/${parsed.output}`)
}
