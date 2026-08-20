import * as v from "valibot"

export const uiAssetDialogSchema = v.picklist(["move", "outputs", "delete"])

export type UiAssetDialog = v.InferOutput<typeof uiAssetDialogSchema>
