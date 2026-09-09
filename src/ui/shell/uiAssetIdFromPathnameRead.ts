/** Extracts the asset identifier from an asset detail pathname. */
export const uiAssetIdFromPathnameRead = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/projects\/[^/?#]+(?:\/(?:admin|contributor))?\/assets\/([^/?#]+)/)
  if (!match || !match[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
