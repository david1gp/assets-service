import type { Folders } from "../../asset/foldersSchema.js"

/** Formats an asset location as the slash-joined folder and filename path. */
export const uiAssetPathFormat = (folders: Folders, filename: string): string =>
  [...folders, filename].filter((segment) => segment.length > 0).join("/")
