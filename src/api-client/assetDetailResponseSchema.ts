import * as v from "valibot"

import { assetSchema } from "../asset/assetSchema.js"
import { assetMetadataSchema } from "../metadata/assetMetadataSchema.js"
import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"
import { outputVersionSchema } from "../output/outputVersionSchema.js"
import { sourceRevisionSchema } from "../upload/sourceRevisionSchema.js"

const outputHistorySchema = v.strictObject({
  definition: outputDefinitionSchema,
  versions: v.array(outputVersionSchema),
})

export const assetDetailResponseSchema = v.strictObject({
  ...assetSchema.entries,
  sourcePath: v.pipe(v.string(), v.minLength(1)),
  sourceHistory: v.array(sourceRevisionSchema),
  outputHistory: v.array(outputHistorySchema),
  metadata: v.nullable(assetMetadataSchema),
})

export type AssetDetailResponse = v.InferOutput<typeof assetDetailResponseSchema>
