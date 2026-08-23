import type { UiStructureNode } from "./uiStructureNode.js"

export const uiStructureUnassignedOptionValue = "unassigned"

export type UiStructureFolderOption = {
  id: string
  path: string
  depth: 1 | 2 | 3
}

/** Flattens the folder forest into full option paths for the move and parent controls. */
export const uiStructureFolderOptionsRead = (roots: readonly UiStructureNode[]): UiStructureFolderOption[] => {
  const options: UiStructureFolderOption[] = []
  const walk = (node: UiStructureNode, prefix: string) => {
    const path = prefix === "" ? node.folder.name : `${prefix}/${node.folder.name}`
    options.push({ id: node.folder.id, path, depth: node.folder.depth })
    for (const child of node.children) walk(child, path)
  }
  for (const root of roots) walk(root, "")
  return options
}
