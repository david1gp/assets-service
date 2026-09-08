import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiPaths } from "./uiPaths.js"

const decodeSegmentRead = (segment: string): string | undefined => {
  try {
    const decoded = decodeURIComponent(segment)
    return decoded.length === 0 ? undefined : decoded
  } catch {
    return undefined
  }
}

/** Maps one recognized legacy project URL to a safe mode-specific destination. */
export const uiLegacyRouteRedirectRead = (
  pathname: string,
  mode: AuthenticationMode,
  search = "",
): string | undefined => {
  if (!pathname.startsWith("/") || pathname.includes("\\")) return undefined
  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  if (segments[0] !== "projects" || segments.length < 2 || segments.length > 4) return undefined
  const projectId = decodeSegmentRead(segments[1] ?? "")
  if (projectId === undefined) return undefined

  const paths = mode === "admin" ? uiPaths.admin : uiPaths.contributor
  if (segments.length === 2) return `${paths.project(projectId)}${search}`

  const section = segments[2]
  if (section === "assets") {
    if (segments.length === 3) return `${paths.assets(projectId)}${search}`
    if (segments.length === 4) {
      const assetId = decodeSegmentRead(segments[3] ?? "")
      if (assetId === undefined) return undefined
      return `${paths.asset(projectId, assetId)}${search}`
    }
  }
  if (section === "upload" && segments.length === 3) return `${paths.upload(projectId)}${search}`
  if (mode === "admin" && segments.length === 3) {
    if (section === "settings") return `${uiPaths.admin.projectSettings(projectId)}${search}`
    if (section === "jobs") return `${uiPaths.admin.jobs(projectId)}${search}`
    if (section === "backups") return `${uiPaths.admin.backups(projectId)}${search}`
    if (section === "catalog") return `${uiPaths.admin.catalog(projectId)}${search}`
    if (section === "audit") return `${uiPaths.admin.audit(projectId)}${search}`
  }
  if (mode === "contributor" && segments.length === 3) {
    if (["settings", "jobs", "backups", "catalog", "audit"].includes(section ?? "")) {
      return `${paths.project(projectId)}${search}`
    }
  }
  return undefined
}
