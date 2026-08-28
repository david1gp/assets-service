import * as v from "valibot"

import { assetListItemSchema } from "../../api-client/assetListItemSchema.js"
import { pageInfoSchema } from "../../api-client/pageInfoSchema.js"
import { structureResponseSchema } from "../../api-client/structureResponseSchema.js"

export const uiAssetStructureSchema = v.strictObject({
  ...structureResponseSchema.entries,
  assets: v.array(assetListItemSchema),
  page: pageInfoSchema,
})

export type UiAssetStructure = v.InferOutput<typeof uiAssetStructureSchema>
