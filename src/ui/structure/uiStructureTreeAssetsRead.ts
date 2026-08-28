import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import type { UiStructureNode } from "./uiStructureNode.js"
import type { UiStructureTree } from "./uiStructureTree.js"

/** Collects every asset of a structure tree as one flat list, folders last-to-first ignored. */
export const uiStructureTreeAssetsRead = (tree: UiStructureTree): AssetListItem[] => {
  const assets: AssetListItem[] = []
  const walk = (node: UiStructureNode) => {
    for (const asset of node.assets) assets.push(asset)
    for (const child of node.children) walk(child)
  }
  for (const root of tree.roots) walk(root)
  for (const asset of tree.unassigned) assets.push(asset)
  return assets
}
