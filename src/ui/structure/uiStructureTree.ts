import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import type { UiStructureNode } from "./uiStructureNode.js"

/** The logical folder forest of one project plus the assets outside of it. */
export type UiStructureTree = {
  roots: UiStructureNode[]
  unassigned: AssetListItem[]
}
