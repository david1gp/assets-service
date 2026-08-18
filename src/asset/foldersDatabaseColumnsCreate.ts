import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { FoldersDatabaseColumns } from "./foldersDatabaseColumnsSchema.js"
import { foldersSchema } from "./foldersSchema.js"

export const foldersDatabaseColumnsCreate = (folders: unknown): Result<FoldersDatabaseColumns> => {
  const op = "foldersDatabaseColumnsCreate"
  const parsed = v.safeParse(foldersSchema, folders)
  if (!parsed.success) return resultErrorCreate(op, "Invalid folder tuple", parsed.issues)

  return {
    success: true,
    data: {
      folder1: parsed.output[0] ?? null,
      folder2: parsed.output[1] ?? null,
      folder3: parsed.output[2] ?? null,
    },
  }
}
