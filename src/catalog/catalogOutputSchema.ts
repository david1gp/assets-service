import * as v from "valibot"

import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const catalogOutputSchema = v.strictObject({
  assetId: idSchema,
  outputVersionId: idSchema,
  class: assetClassSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  property: v.pipe(v.string(), v.minLength(1)),
  path: v.pipe(v.string(), v.minLength(1)),
  metadata: mediaMetadataSchema,
})

export type CatalogOutput = v.InferOutput<typeof catalogOutputSchema>
