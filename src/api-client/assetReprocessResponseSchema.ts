import * as v from "valibot"

import { assetDetailResponseSchema } from "./assetDetailResponseSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const assetReprocessResponseSchema = v.strictObject({
  asset: assetDetailResponseSchema,
  workflowId: idSchema,
})

export type AssetReprocessResponse = v.InferOutput<typeof assetReprocessResponseSchema>
