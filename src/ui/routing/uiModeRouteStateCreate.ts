import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiPaths } from "./uiPaths.js"

/** Holds trusted-session authorization state for one mode-specific route. */
export const uiModeRouteStateCreate = (mode: AuthenticationMode) => {
  const params = useParams<{ projectId: string }>()
  const session = createMemo(() => uiSessionStore.get())
  const isDenied = createMemo(() => {
    const current = session()
    return (
      current.status === "authenticated" &&
      current.principal !== null &&
      mode === "admin" &&
      current.principal.mode !== "admin"
    )
  })
  const redirectPath = createMemo(() => uiPaths.contributor.project(params.projectId))

  return { isDenied, redirectPath }
}
