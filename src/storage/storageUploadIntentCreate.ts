import * as v from "valibot"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "./storageAdapter.js"
import type { StorageBinding } from "./storageBindingSchema.js"
import { storageStagingObjectKeyCreate } from "./storageStagingObjectKeyCreate.js"
import type { StorageUploadIntent } from "./storageUploadIntentSchema.js"

export const storageUploadIntentCreate = async (
  adapter: StorageAdapter,
  input: {
    binding: StorageBinding
    uploadId: string
    byteSize: number
    mediaType: string
    sha256?: string
    expiresInSeconds?: number
    now?: Date
  },
): Promise<Result<StorageUploadIntent>> => {
  const op = "storageUploadIntentCreate"
  if (!Number.isInteger(input.byteSize) || input.byteSize < 0)
    return resultErrorCreate(op, "Upload byte size must be a non-negative integer")
  const mediaType = v.safeParse(mediaTypeSchema, input.mediaType)
  if (!mediaType.success) return resultErrorCreate(op, v.summarize(mediaType.issues), input.mediaType)
  if (input.sha256 !== undefined && !v.safeParse(sha256Schema, input.sha256).success)
    return resultErrorCreate(op, "Upload checksum was invalid")
  if (!Number.isInteger(input.expiresInSeconds ?? 600) || (input.expiresInSeconds ?? 600) < 1)
    return resultErrorCreate(op, "Upload intent expiry must be a positive integer")
  const location = storageStagingObjectKeyCreate(input.binding, input.uploadId)
  if (!location.success) return location
  return adapter.createSignedUploadIntent({
    location: location.data,
    byteSize: input.byteSize,
    mediaType: mediaType.output,
    ...(input.sha256 ? { sha256: input.sha256 } : {}),
    expiresInSeconds: input.expiresInSeconds ?? 600,
    ...(input.now ? { now: input.now } : {}),
  })
}
