import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import type { ProjectListItem } from "../../api-client/projectListItemSchema.js"

/** Reads the sole unfiltered contributor project that is safe to open directly. */
export const uiProjectListContributorRedirectProjectIdRead = (input: {
  mode: AuthenticationMode | undefined
  search: string | undefined
  cursor: number | undefined
  projects: readonly ProjectListItem[]
}): string | null => {
  if (input.mode !== "contributor" || input.search !== undefined || input.cursor !== undefined) return null
  if (input.projects.length !== 1) return null
  return input.projects[0]?.id ?? null
}
