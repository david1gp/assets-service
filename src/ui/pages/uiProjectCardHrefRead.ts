import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiPaths } from "../routing/uiPaths.js"

/** Reads the project-card destination for the active project view. */
export const uiProjectCardHrefRead = (
  projectId: string,
  mode: AuthenticationMode | undefined,
  organizationSlug?: string,
  projectSlug?: string,
): string => {
  if (organizationSlug !== undefined && projectSlug !== undefined) {
    return mode === "contributor"
      ? uiPaths.contributor.project(organizationSlug, projectSlug)
      : uiPaths.admin.assets(organizationSlug, projectSlug)
  }
  return mode === "contributor" ? uiPaths.contributor.project(projectId) : uiPaths.admin.assets(projectId)
}
