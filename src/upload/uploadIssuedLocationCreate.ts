import * as v from "valibot"

import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingSchema, type StorageBinding } from "../storage/storageBindingSchema.js"
import type { StorageObjectLocation } from "../storage/storageObjectLocation.js"

type UploadIssuedLocationInput = {
  id: string
  issuedBucket: string | null
  issuedObjectKey: string | null
}

export const uploadIssuedLocationCreate = (
  binding: StorageBinding,
  upload: UploadIssuedLocationInput,
): Result<StorageObjectLocation & { bucket: string; objectKey: string }> => {
  const op = "uploadIssuedLocationCreate"
  if (upload.issuedBucket === null && upload.issuedObjectKey === null)
    return resultErrorCreate(op, "The upload has no persisted issued storage location")
  if (upload.issuedBucket === null || upload.issuedObjectKey === null)
    return resultErrorCreate(op, "The upload issued storage location is incomplete")

  const parsedBinding = v.safeParse(storageBindingSchema, { ...binding, bucket: upload.issuedBucket })
  if (!parsedBinding.success)
    return resultErrorCreate(op, "The upload issued storage binding was invalid", parsedBinding.issues)
  const parsedObjectKey = v.safeParse(outputObjectKeySchema, upload.issuedObjectKey)
  if (!parsedObjectKey.success)
    return resultErrorCreate(op, "The upload issued storage key was invalid", parsedObjectKey.issues)

  return {
    success: true,
    data: {
      binding: parsedBinding.output,
      namespace: "private-staging",
      key: `uploads/${upload.id}`,
      bucket: parsedBinding.output.bucket,
      objectKey: parsedObjectKey.output,
    },
  }
}
