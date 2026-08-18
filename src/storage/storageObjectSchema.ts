import * as v from "valibot"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const storageObjectSchema = v.strictObject({
  key: outputObjectKeySchema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: v.optional(mediaTypeSchema),
  sha256: v.optional(sha256Schema),
  etag: v.optional(v.pipe(v.string(), v.minLength(1))),
  cacheControl: v.optional(v.pipe(v.string(), v.minLength(1))),
  lastModified: v.optional(isoDateSchema),
})

export type StorageObject = v.InferOutput<typeof storageObjectSchema>
