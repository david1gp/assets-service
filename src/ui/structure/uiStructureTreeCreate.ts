import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import type { StructureFolder } from "../../structure/structureFolderSchema.js"
import type { UiStructureNode } from "./uiStructureNode.js"
import type { UiStructureTree } from "./uiStructureTree.js"

const nameCompare = (left: UiStructureNode, right: UiStructureNode) => left.folder.name.localeCompare(right.folder.name)

/**
 * Builds the three-level logical folder forest from the known folders, the
 * loaded asset page, and the resolved folder of every asset. Assets whose
 * folder is unknown or `null` land in `unassigned`.
 */
export const uiStructureTreeCreate = (
  folders: readonly StructureFolder[],
  assets: readonly AssetListItem[],
  folderIdByAssetId: ReadonlyMap<string, string | null>,
): UiStructureTree => {
  const nodes = new Map<string, UiStructureNode>()
  for (const folder of folders) nodes.set(folder.id, { folder, assets: [], children: [] })

  const roots: UiStructureNode[] = []
  for (const node of nodes.values()) {
    const parent = node.folder.parentId === null ? undefined : nodes.get(node.folder.parentId)
    if (parent === undefined) roots.push(node)
    else parent.children.push(node)
  }

  const unassigned: AssetListItem[] = []
  for (const asset of assets) {
    const node = nodes.get(folderIdByAssetId.get(asset.id) ?? "")
    if (node === undefined) unassigned.push(asset)
    else node.assets.push(asset)
  }

  for (const node of nodes.values()) node.children.sort(nameCompare)
  roots.sort(nameCompare)
  return { roots, unassigned }
}
