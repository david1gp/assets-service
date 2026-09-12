import { ttc } from "../localization/ttc.js"
import { uiAssetIdFromPathnameRead } from "./uiAssetIdFromPathnameRead.js"

/** Resolves the breadcrumb page label for the current project pathname. */
export const uiBreadcrumbPageRead = (pathname: string, assetName?: string): string | undefined => {
  const assetId = uiAssetIdFromPathnameRead(pathname)
  if (assetId !== undefined && assetId !== "") {
    return assetName || assetId
  }
  if (
    /^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/(?:admin|contributor))?\/assets\/?$/.test(pathname)
  ) {
    return "List"
  }
  if (
    /^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/(?:admin|contributor))?\/upload\/?$/.test(pathname)
  ) {
    return "Upload"
  }
  if (/^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/admin)?\/jobs\/?$/.test(pathname)) {
    return ttc("Jobs", "Aufträge")
  }
  if (/^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/admin)?\/backups\/?$/.test(pathname)) {
    return ttc("Backups", "Sicherungen")
  }
  if (/^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/admin)?\/catalog\/?$/.test(pathname)) {
    return ttc("Catalog", "Katalog")
  }
  if (/^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/admin)?\/audit\/?$/.test(pathname)) {
    return ttc("Audit", "Protokoll")
  }
  if (/^(?:\/projects\/[^/?#]+|\/orgs\/[^/?#]+\/projects\/[^/?#]+)(?:\/admin)?\/settings\/?$/.test(pathname)) {
    return ttc("Settings", "Einstellungen")
  }
  return undefined
}
