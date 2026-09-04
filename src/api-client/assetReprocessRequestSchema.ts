import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const assetReprocessRequestSchema = v.strictObject({
  environmentId: idSchema,
})

export type AssetReprocessRequest = v.InferOutput<typeof assetReprocessRequestSchema>
