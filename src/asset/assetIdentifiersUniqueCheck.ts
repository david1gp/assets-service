import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { assetIdentifierCreate } from "./assetIdentifierCreate.js"
import type { Folders } from "./foldersSchema.js"

export const assetIdentifiersUniqueCheck = (
  entries: readonly { folders: Folders; basename: string; outputKey: string }[],
): Result<null> => {
  const op = "assetIdentifiersUniqueCheck"
  const identifiers = new Set<string>()

  for (const entry of entries) {
    const identifier = assetIdentifierCreate(entry.folders, entry.basename, entry.outputKey)
    if (identifiers.has(identifier)) return resultErrorCreate(op, `Duplicate generated identifier: ${identifier}`)
    identifiers.add(identifier)
  }

  return { success: true, data: null }
}
