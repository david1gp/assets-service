import type { Folders } from "./foldersSchema.js"

export const assetSourcePathCreate = (folders: Folders, filename: string): string =>
  [...folders.map((folder) => folder.normalize("NFC")), filename.normalize("NFC")].join("/")
