import * as v from "valibot"

export const deleteAssetRequestSchema = v.strictObject({})

export type DeleteAssetRequest = v.InferOutput<typeof deleteAssetRequestSchema>
