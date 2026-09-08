import { useLocation } from "@solidjs/router"
import { createMemo } from "solid-js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiLegacyRouteRedirectRead } from "./uiLegacyRouteRedirectRead.js"

/** Holds the authenticated destination for a legacy project route. */
export const uiLegacyRouteRedirectStateCreate = () => {
  const location = useLocation()
  const session = createMemo(() => uiSessionStore.get())
  const target = createMemo(() => {
    const current = session()
    if (current.status !== "authenticated" || current.principal === null) return undefined
    return uiLegacyRouteRedirectRead(location.pathname, current.principal.mode, location.search)
  })
  return { target }
}
