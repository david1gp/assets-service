import * as v from "valibot"

import { documentExtensionSchema } from "../document/documentExtensionSchema.js"
import { documentMediaTypeSchema } from "../document/documentMediaTypeSchema.js"

export const documentMetadataSchema = v.strictObject({
  kind: v.literal("document"),
  extension: documentExtensionSchema,
  mediaType: documentMediaTypeSchema,
})

export type DocumentMetadata = v.InferOutput<typeof documentMetadataSchema>
