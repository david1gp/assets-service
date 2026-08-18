import * as v from "valibot"

import { assetListItemSchema } from "./assetListItemSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const assetListResponseSchema = v.strictObject({
  assets: v.array(assetListItemSchema),
  page: pageInfoSchema,
})

export type AssetListResponse = v.InferOutput<typeof assetListResponseSchema>
