import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { documentMediaTypeSchema } from "../document/documentMediaTypeSchema.js"

export const documentProcessingRequestSchema = v.strictObject({
  sourceBytes: v.instance(Uint8Array),
  sourceName: assetFilenameSchema,
  mediaType: documentMediaTypeSchema,
})

export type DocumentProcessingRequest = v.InferOutput<typeof documentProcessingRequestSchema>
