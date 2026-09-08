import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"

/** Reads the explicit project view from a mode-specific pathname. */
export const uiProjectRouteModeRead = (pathname: string): AuthenticationMode | undefined => {
  const segments = pathname.split("/").filter((segment) => segment.length > 0)
  if (segments.length < 3 || segments[0] !== "projects") return undefined
  if (segments[2] !== "admin" && segments[2] !== "contributor") return undefined
  return segments[2]
}
