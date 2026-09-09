import { ttc } from "../localization/ttc.js"
import { uiAssetIdFromPathnameRead } from "./uiAssetIdFromPathnameRead.js"

/** Resolves the breadcrumb page label for the current project pathname. */
export const uiBreadcrumbPageRead = (pathname: string, assetName?: string): string | undefined => {
  const assetId = uiAssetIdFromPathnameRead(pathname)
  if (assetId !== undefined && assetId !== "") {
    return assetName || assetId
  }
  if (/^\/projects\/[^/?#]+(?:\/(?:admin|contributor))?\/assets\/?$/.test(pathname)) {
    return "List"
  }
  if (/^\/projects\/[^/?#]+(?:\/(?:admin|contributor))?\/upload\/?$/.test(pathname)) {
    return "Upload"
  }
  if (/^\/projects\/[^/?#]+(?:\/admin)?\/jobs\/?$/.test(pathname)) {
    return ttc("Jobs", "Aufträge")
  }
  if (/^\/projects\/[^/?#]+(?:\/admin)?\/backups\/?$/.test(pathname)) {
    return ttc("Backups", "Sicherungen")
  }
  if (/^\/projects\/[^/?#]+(?:\/admin)?\/catalog\/?$/.test(pathname)) {
    return ttc("Catalog", "Katalog")
  }
  if (/^\/projects\/[^/?#]+(?:\/admin)?\/audit\/?$/.test(pathname)) {
    return ttc("Audit", "Protokoll")
  }
  if (/^\/projects\/[^/?#]+(?:\/admin)?\/settings\/?$/.test(pathname)) {
    return ttc("Settings", "Einstellungen")
  }
  return undefined
}
