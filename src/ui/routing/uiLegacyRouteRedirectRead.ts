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
  organizationSlug?: string,
  projectSlug?: string,
): string | undefined => {
  if (!pathname.startsWith("/") || pathname.includes("\\")) return undefined
  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  if (segments[0] !== "projects" || segments.length < 2 || segments.length > 5) return undefined
  const projectId = decodeSegmentRead(segments[1] ?? "")
  if (projectId === undefined) return undefined

  const canonical = organizationSlug !== undefined && projectSlug !== undefined
  const explicitMode = segments[2] === "admin" || segments[2] === "contributor"
  const sectionIndex = explicitMode ? 3 : 2
  const redirectMode: AuthenticationMode = explicitMode ? (segments[2] === "admin" ? "admin" : "contributor") : mode
  const paths = redirectMode === "admin" ? uiPaths.admin : uiPaths.contributor
  if (segments.length === 2)
    return `${canonical ? paths.project(organizationSlug, projectSlug) : paths.project(projectId)}${search}`
  if (explicitMode && segments.length === 3)
    return `${canonical ? paths.project(organizationSlug, projectSlug) : paths.project(projectId)}${search}`

  const section = segments[sectionIndex]
  if (section === "assets") {
    if (segments.length === sectionIndex + 1)
      return `${canonical ? paths.assets(organizationSlug, projectSlug) : paths.assets(projectId)}${search}`
    if (segments.length === sectionIndex + 2) {
      const assetId = decodeSegmentRead(segments[sectionIndex + 1] ?? "")
      if (assetId === undefined) return undefined
      return `${canonical ? paths.asset(organizationSlug, projectSlug, assetId) : paths.asset(projectId, assetId)}${search}`
    }
  }
  if (section === "upload" && segments.length === sectionIndex + 1)
    return `${canonical ? paths.upload(organizationSlug, projectSlug) : paths.upload(projectId)}${search}`
  if (redirectMode === "admin" && segments.length === sectionIndex + 1) {
    if (section === "settings")
      return `${canonical ? uiPaths.admin.projectSettings(organizationSlug, projectSlug) : uiPaths.admin.projectSettings(projectId)}${search}`
    if (section === "jobs")
      return `${canonical ? uiPaths.admin.jobs(organizationSlug, projectSlug) : uiPaths.admin.jobs(projectId)}${search}`
    if (section === "backups")
      return `${canonical ? uiPaths.admin.backups(organizationSlug, projectSlug) : uiPaths.admin.backups(projectId)}${search}`
    if (section === "catalog")
      return `${canonical ? uiPaths.admin.catalog(organizationSlug, projectSlug) : uiPaths.admin.catalog(projectId)}${search}`
    if (section === "audit")
      return `${canonical ? uiPaths.admin.audit(organizationSlug, projectSlug) : uiPaths.admin.audit(projectId)}${search}`
  }
  if (redirectMode === "contributor" && segments.length === sectionIndex + 1) {
    if (["settings", "jobs", "backups", "catalog", "audit"].includes(section ?? "")) {
      return `${canonical ? paths.project(organizationSlug, projectSlug) : paths.project(projectId)}${search}`
    }
  }
  return undefined
}
