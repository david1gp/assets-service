import { assetIdentifierCreate } from "../asset/assetIdentifierCreate.js"
import type { CatalogEntry } from "./catalogEntrySchema.js"

export const catalogEntryPropertyCreate = (entry: Pick<CatalogEntry, "folders" | "basename" | "key">): string => {
  return assetIdentifierCreate(entry.folders, entry.basename, entry.key)
}
