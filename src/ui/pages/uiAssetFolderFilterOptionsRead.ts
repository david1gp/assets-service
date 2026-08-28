/**
 * Empty value of the folder filter select. Folder segments are never empty, so
 * this can never collide with a real folder path.
 */
export const uiAssetFolderFilterAllValue = ""

/**
 * Builds the flat canonical-folder filter option list. A currently applied
 * folder value that no longer exists stays selectable so it remains
 * representable and clearable instead of silently switching to another folder.
 */
export const uiAssetFolderFilterOptionsRead = (paths: readonly string[], current: string): string[] => {
  const options = [uiAssetFolderFilterAllValue, ...paths]
  if (current !== uiAssetFolderFilterAllValue && !options.includes(current)) options.push(current)
  return options
}
