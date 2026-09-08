import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiProjectRouteModeRead } from "./uiProjectRouteModeRead.js"

/** Tells whether a trusted principal mode may access an explicit project view. */
export const uiRouteModeAllowed = (pathname: string, principalMode: AuthenticationMode): boolean => {
  const routeMode = uiProjectRouteModeRead(pathname)
  if (routeMode === undefined) return true
  if (routeMode === "contributor") return true
  return principalMode === "admin"
}
