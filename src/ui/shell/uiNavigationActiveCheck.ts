/** Checks whether a navigation target link matches or prefixes the current pathname. */
export const uiNavigationActiveCheck = (currentPath: string, targetPath: string): boolean => {
  if (currentPath === targetPath) return true
  if (targetPath === "/" || targetPath === "") return false
  if (currentPath.startsWith(`${targetPath}/`)) return true
  return false
}
