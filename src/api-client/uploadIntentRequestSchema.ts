import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const uploadIntentRequestSchema = v.strictObject({
  uploadId: v.optional(idSchema),
  environment: v.optional(environmentNameSchema),
  originalFilename: assetFilenameSchema,
  folders: foldersSchema,
  integrationNote: v.pipe(v.string(), v.minLength(1), v.maxLength(10000)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: mediaTypeSchema,
  sha256: v.optional(sha256Schema),
})

export type UploadIntentRequest = v.InferOutput<typeof uploadIntentRequestSchema>
