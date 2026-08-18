import * as v from "valibot"

import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const sourceRevisionSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  class: assetClassSchema,
  originalFilename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  mediaType: mediaTypeSchema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: sha256Schema,
  objectKey: v.pipe(v.string(), v.minLength(1)),
  createdAt: isoDateSchema,
})

export type SourceRevision = v.InferOutput<typeof sourceRevisionSchema>
