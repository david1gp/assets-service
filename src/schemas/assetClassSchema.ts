import * as v from "valibot"

export const assetClassSchema = v.picklist(["image", "video", "font", "document"])

export type AssetClass = v.InferOutput<typeof assetClassSchema>
