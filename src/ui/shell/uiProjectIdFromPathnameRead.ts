/** Extracts the project identifier from a pathname starting with /projects/:projectId. */
export const uiProjectIdFromPathnameRead = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/projects\/([^/?#]+)/)
  if (!match || !match[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
