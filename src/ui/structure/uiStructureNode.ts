import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import type { StructureFolder } from "../../structure/structureFolderSchema.js"

/** One logical folder with the assets placed directly in it and its child folders. */
export type UiStructureNode = {
  folder: StructureFolder
  assets: AssetListItem[]
  children: UiStructureNode[]
}
