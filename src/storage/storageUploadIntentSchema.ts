import * as v from "valibot"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const storageUploadIntentSchema = v.strictObject({
  method: v.literal("PUT"),
  url: v.pipe(v.string(), v.url()),
  key: outputObjectKeySchema,
  expiresAt: isoDateSchema,
  headers: v.record(v.string(), v.string()),
  mediaType: mediaTypeSchema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: v.optional(sha256Schema),
})

export type StorageUploadIntent = v.InferOutput<typeof storageUploadIntentSchema>
