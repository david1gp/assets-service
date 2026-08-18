import * as v from "valibot"

export const assetClassSchema = v.picklist(["image", "video", "font"])

export type AssetClass = v.InferOutput<typeof assetClassSchema>
