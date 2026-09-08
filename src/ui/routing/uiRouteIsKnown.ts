const adminProjectSections = ["settings", "assets", "upload", "jobs", "backups", "catalog", "audit"]
const contributorProjectSections = ["assets", "upload"]

/**
 * Tells whether a pathname matches a route of this SPA. Unknown paths render the
 * not-found view directly instead of waiting for a session that will never make
 * the route exist.
 */
export const uiRouteIsKnown = (pathname: string): boolean => {
  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  if (segments.length === 0) return true
  if (segments.length === 1 && segments[0] === "login") return true
  if (segments[0] !== "projects") return false
  if (segments.length === 2) return true

  const mode = segments[2]
  if (mode === "admin" || mode === "contributor") {
    if (segments.length === 3) return true
    return projectRouteIsKnown(segments, mode === "admin" ? adminProjectSections : contributorProjectSections)
  }

  const legacySection = mode ?? ""
  if (!adminProjectSections.includes(legacySection)) return false
  if (segments.length === 3) return true
  return segments.length === 4 && legacySection === "assets"
}

const projectRouteIsKnown = (segments: string[], sections: readonly string[]): boolean => {
  const section = segments[3] ?? ""
  if (!sections.includes(section)) return false
  if (segments.length === 4) return true
  return segments.length === 5 && section === "assets"
}
