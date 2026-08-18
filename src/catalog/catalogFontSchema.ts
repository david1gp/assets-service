import * as v from "valibot"

import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { fontMetadataSchema } from "../metadata/fontMetadataSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"

export const catalogFontSchema = v.strictObject({
  class: v.literal("font"),
  folders: foldersSchema,
  basename: assetBasenameSchema,
  key: outputKeySchema,
  path: outputObjectKeySchema,
  mediaType: mediaTypeSchema,
  metadata: fontMetadataSchema,
})

export type CatalogFont = v.InferOutput<typeof catalogFontSchema>
