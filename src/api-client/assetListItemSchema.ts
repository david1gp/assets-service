import * as v from "valibot"

import { assetSchema } from "../asset/assetSchema.js"
import { deletionStateSchema } from "../deletion/deletionStateSchema.js"
import { assetMetadataSchema } from "../metadata/assetMetadataSchema.js"
import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"
import { outputVersionSchema } from "../output/outputVersionSchema.js"
import { sourceRevisionSchema } from "../upload/sourceRevisionSchema.js"

export const assetListItemSchema = v.strictObject({
  ...assetSchema.entries,
  sourcePath: v.pipe(v.string(), v.minLength(1)),
  outputCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  deletionStatus: v.optional(deletionStateSchema.entries.status),
  sourceHistory: v.optional(v.array(sourceRevisionSchema)),
  outputHistory: v.optional(
    v.array(
      v.strictObject({
        definition: outputDefinitionSchema,
        versions: v.array(outputVersionSchema),
      }),
    ),
  ),
  metadata: v.optional(v.nullable(assetMetadataSchema)),
})

export type AssetListItem = v.InferOutput<typeof assetListItemSchema>
