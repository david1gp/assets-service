import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { foldersDatabaseColumnsSchema } from "./foldersDatabaseColumnsSchema.js"
import type { Folders } from "./foldersSchema.js"

export const foldersDatabaseColumnsRead = (columns: unknown): Result<Folders> => {
  const op = "foldersDatabaseColumnsRead"
  const parsed = v.safeParse(foldersDatabaseColumnsSchema, columns)
  if (!parsed.success) return resultErrorCreate(op, "Invalid folder columns", parsed.issues)

  const folders = [parsed.output.folder1, parsed.output.folder2, parsed.output.folder3].filter(
    (folder): folder is string => folder !== null,
  )
  return { success: true, data: folders }
}
