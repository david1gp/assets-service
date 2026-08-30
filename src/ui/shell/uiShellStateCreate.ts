import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { createMemo, onCleanup, onMount } from "solid-js"
import * as v from "valibot"
import { projectSchema, type Project } from "../../project/projectSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiRouteIsKnown } from "../routing/uiRouteIsKnown.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSessionLogout } from "../session/uiSessionLogout.js"
import { uiSessionRefresh } from "../session/uiSessionRefresh.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiNavigationActiveCheck } from "./uiNavigationActiveCheck.js"
import { uiNavigationLinksRead } from "./uiNavigationLinksRead.js"
import { uiProjectIdFromPathnameRead } from "./uiProjectIdFromPathnameRead.js"

/** Holds shell-local navigation, session, and menu state. */
export const uiShellStateCreate = () => {
  const params = useParams<{ projectId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const menuOpen = createSignalObject(false)
  const loggingOut = createSignalObject(false)

  onMount(() => {
    if (uiSessionStore.get().status === "unknown") void uiSessionRefresh()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen.get()) {
        menuOpen.set(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown))
  })

  const session = createMemo(() => uiSessionStore.get())
  const projectId = createMemo(() => params.projectId || (uiProjectIdFromPathnameRead(location.pathname) ?? ""))
  const projectQuery = uiQueryCreate<Project | null>(
    async () => {
      const id = projectId()
      if (id === "") return { success: true, data: null }
      if (session().status !== "authenticated") return { success: true, data: null }

      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiShellProjectRead", client.errorMessage)
      return client.data.projectRead(id)
    },
    {
      cacheKey: () => (projectId() === "" ? undefined : uiQueryCacheKeyCreate("project", projectId())),
      cacheSchema: v.nullable(projectSchema),
    },
  )
  const projectName = createMemo(() => projectQuery.data()?.name ?? "")
  const accountName = createMemo(() => session().principal?.displayName ?? "")
  const accountId = createMemo(() => session().principal?.subjectId ?? "")
  const links = createMemo(() => (projectId() === "" ? [] : uiNavigationLinksRead(projectId())))
  const isCurrent = (href: string) => uiNavigationActiveCheck(location.pathname, href)
  const isKnownRoute = createMemo(() => uiRouteIsKnown(location.pathname))

  const logout = async () => {
    loggingOut.set(true)
    const result = await uiSessionLogout()
    loggingOut.set(false)
    if (!result.success) {
      uiToastAdd({ tone: "negative", title: "Sign out failed", description: result.errorMessage })
      return
    }
    navigate(uiPaths.login, { replace: true })
  }

  return {
    session,
    projectId,
    projectQuery,
    projectName,
    accountName,
    accountId,
    links,
    isCurrent,
    isKnownRoute,
    menuOpen,
    isLoggingOut: loggingOut.get,
    closeMenu: () => menuOpen.set(false),
    toggleMenu: () => menuOpen.set(!menuOpen.get()),
    logout,
  }
}
