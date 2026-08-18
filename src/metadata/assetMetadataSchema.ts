import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaMetadataSchema } from "./mediaMetadataSchema.js"

export const assetMetadataSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  sourceRevisionId: idSchema,
  metadata: mediaMetadataSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type AssetMetadata = v.InferOutput<typeof assetMetadataSchema>
