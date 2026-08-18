import * as v from "valibot"

import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { videoMetadataSchema } from "../metadata/videoMetadataSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"

export const catalogVideoSchema = v.strictObject({
  class: v.literal("video"),
  folders: foldersSchema,
  basename: assetBasenameSchema,
  key: outputKeySchema,
  path: outputObjectKeySchema,
  mediaType: mediaTypeSchema,
  metadata: videoMetadataSchema,
})

export type CatalogVideo = v.InferOutput<typeof catalogVideoSchema>
