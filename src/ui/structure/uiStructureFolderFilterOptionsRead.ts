/**
 * Empty value of the folder filter select. Folder segments are never empty, so
 * this can never collide with a real folder path.
 */
export const uiStructureFolderFilterAllValue = ""

/**
 * Builds the flat folder filter option list. A currently applied folder value
 * that no longer exists stays selectable so it remains representable and
 * clearable instead of silently switching to another folder.
 */
export const uiStructureFolderFilterOptionsRead = (paths: readonly string[], current: string): string[] => {
  const options = [uiStructureFolderFilterAllValue, ...paths]
  if (current !== uiStructureFolderFilterAllValue && !options.includes(current)) options.push(current)
  return options
}
