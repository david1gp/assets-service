import type { AssetListItem } from "../../api-client/assetListItemSchema.js"

/** Flattens every canonical asset folder and its parent paths into sorted options. */
export const uiAssetFolderPathsRead = (assets: readonly AssetListItem[]): string[] => {
  const paths = new Set<string>()
  for (const asset of assets) {
    for (let depth = 1; depth <= asset.folders.length; depth += 1) paths.add(asset.folders.slice(0, depth).join("/"))
  }
  return [...paths].sort((left, right) => left.localeCompare(right))
}
