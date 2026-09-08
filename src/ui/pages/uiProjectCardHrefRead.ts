import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiPaths } from "../routing/uiPaths.js"

/** Reads the project-card destination for the active project view. */
export const uiProjectCardHrefRead = (projectId: string, mode: AuthenticationMode | undefined): string =>
  mode === "contributor" ? uiPaths.contributor.project(projectId) : uiPaths.admin.assets(projectId)
