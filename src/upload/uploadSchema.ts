import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { uploadStatusSchema } from "./uploadStatusSchema.js"

export const uploadSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  environmentId: idSchema,
  assetId: v.optional(idSchema),
  sourceRevisionId: v.optional(idSchema),
  uploaderId: v.optional(v.pipe(v.string(), v.minLength(1))),
  originalFilename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  folders: foldersSchema,
  integrationNote: v.pipe(v.string(), v.minLength(1), v.maxLength(10000)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: v.optional(mediaTypeSchema),
  sha256: v.optional(sha256Schema),
  status: uploadStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Upload = v.InferOutput<typeof uploadSchema>
