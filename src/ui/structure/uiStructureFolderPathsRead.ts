import type { StructureFolder } from "../../structure/structureFolderSchema.js"
import { uiStructureFolderOptionsRead } from "./uiStructureFolderOptionsRead.js"
import { uiStructureTreeCreate } from "./uiStructureTreeCreate.js"

/**
 * Flattens every structure folder of a project into sorted `parent/child` paths,
 * so nested folders can be offered as one flat option list.
 */
export const uiStructureFolderPathsRead = (folders: readonly StructureFolder[]): string[] =>
  uiStructureFolderOptionsRead(uiStructureTreeCreate(folders, [], new Map()).roots).map((option) => option.path)
