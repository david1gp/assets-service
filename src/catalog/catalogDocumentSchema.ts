import * as v from "valibot"

import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { documentMetadataSchema } from "../metadata/documentMetadataSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"

export const catalogDocumentSchema = v.strictObject({
  class: v.literal("document"),
  folders: foldersSchema,
  basename: assetBasenameSchema,
  key: outputKeySchema,
  path: outputObjectKeySchema,
  mediaType: mediaTypeSchema,
  metadata: documentMetadataSchema,
})

export type CatalogDocument = v.InferOutput<typeof catalogDocumentSchema>
