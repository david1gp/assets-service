import * as v from "valibot"

import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"
import { outputVersionSchema } from "../output/outputVersionSchema.js"
import { sourceRevisionSchema } from "../upload/sourceRevisionSchema.js"

const outputHistorySchema = v.strictObject({
  definition: outputDefinitionSchema,
  versions: v.array(outputVersionSchema),
})

export const assetHistoryResponseSchema = v.strictObject({
  sourceHistory: v.array(sourceRevisionSchema),
  outputHistory: v.array(outputHistorySchema),
})

export type AssetHistoryResponse = v.InferOutput<typeof assetHistoryResponseSchema>
