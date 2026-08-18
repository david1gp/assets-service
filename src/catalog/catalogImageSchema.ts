import * as v from "valibot"

import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { imageMetadataSchema } from "../metadata/imageMetadataSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"

export const catalogImageSchema = v.strictObject({
  class: v.literal("image"),
  folders: foldersSchema,
  basename: assetBasenameSchema,
  key: outputKeySchema,
  path: outputObjectKeySchema,
  mediaType: mediaTypeSchema,
  metadata: imageMetadataSchema,
})

export type CatalogImage = v.InferOutput<typeof catalogImageSchema>
