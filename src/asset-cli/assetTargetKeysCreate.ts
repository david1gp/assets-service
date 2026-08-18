import { assetBasenameCreate } from "../asset/assetBasenameCreate.js"
import type { Folders } from "../asset/foldersSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"

export type AssetTargetKeys = {
  logicalKey: string
  targetKey: string
}

export const assetTargetKeysCreate = (assetClass: AssetClass, folders: Folders, filename: string): AssetTargetKeys => {
  const normalizedFolders = folders.map((folder) => folder.normalize("NFC"))
  const normalizedFilename = filename.normalize("NFC")
  const basename = assetBasenameCreate(normalizedFilename)
  return {
    logicalKey: JSON.stringify([assetClass, ...normalizedFolders, normalizedFilename]),
    targetKey: JSON.stringify([assetClass, ...normalizedFolders, basename]),
  }
}
