import { useLocation, useNavigate } from "@solidjs/router"
import { createMemo, onCleanup, onMount } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { type AssetDetailResponse, assetDetailResponseSchema } from "../../api-client/assetDetailResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectRouteModeRead } from "../routing/uiProjectRouteModeRead.js"
import { uiProjectRouteStateCreate } from "../routing/uiProjectRouteStateCreate.js"
import { uiRouteIsKnown } from "../routing/uiRouteIsKnown.js"
import { uiSessionLogout } from "../session/uiSessionLogout.js"
import { uiSessionRefresh } from "../session/uiSessionRefresh.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiAssetIdFromPathnameRead } from "./uiAssetIdFromPathnameRead.js"
import { uiBreadcrumbPageRead } from "./uiBreadcrumbPageRead.js"
import { uiNavigationActiveCheck } from "./uiNavigationActiveCheck.js"
import { uiNavigationLinksRead } from "./uiNavigationLinksRead.js"

/** Holds shell-local navigation, session, and menu state. */
export const uiShellStateCreate = () => {
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
  const route = uiProjectRouteStateCreate()
  const projectId = route.projectId
  const projectQuery = route.projectQuery
  const projectName = createMemo(() => projectQuery.data()?.name ?? "")
  const accountName = createMemo(() => session().principal?.displayName ?? "")
  const accountId = createMemo(() => session().principal?.subjectId ?? "")
  const routeMode = createMemo(() => uiProjectRouteModeRead(location.pathname) ?? session().principal?.mode ?? "admin")
  const canonicalRoute = createMemo(
    () => projectId() !== "" && route.organizationSlug() !== "" && route.projectSlug() !== "",
  )
  const links = createMemo(() =>
    projectId() === ""
      ? []
      : uiNavigationLinksRead(
          canonicalRoute()
            ? { organizationSlug: route.organizationSlug(), projectSlug: route.projectSlug() }
            : projectId(),
          routeMode(),
        ),
  )
  const isCurrent = (href: string) => uiNavigationActiveCheck(location.pathname, href)
  const isKnownRoute = createMemo(() => uiRouteIsKnown(location.pathname))

  const assetId = createMemo(() => uiAssetIdFromPathnameRead(location.pathname) ?? "")
  const assetQuery = uiQueryCreate<AssetDetailResponse | null>(
    async () => {
      const pid = projectId()
      const aid = assetId()
      if (pid === "" || aid === "") return { success: true, data: null }
      if (session().status !== "authenticated") return { success: true, data: null }

      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiShellAssetRead", client.errorMessage)
      if (typeof client.data.assetRead !== "function") return { success: true, data: null }
      return client.data.assetRead(pid, aid)
    },
    {
      cacheKey: () =>
        projectId() === "" || assetId() === ""
          ? undefined
          : uiQueryCacheKeyCreate("asset", `${projectId()}:${assetId()}`),
      cacheSchema: v.nullable(assetDetailResponseSchema),
    },
  )
  const projectPath = createMemo(() =>
    projectId() === ""
      ? ""
      : !canonicalRoute()
        ? uiPaths[routeMode()].project(projectId())
        : routeMode() === "contributor"
          ? uiPaths.contributor.project(route.organizationSlug(), route.projectSlug())
          : uiPaths.admin.project(route.organizationSlug(), route.projectSlug()),
  )
  const breadcrumbPage = createMemo(() => uiBreadcrumbPageRead(location.pathname, assetQuery.data()?.filename))

  const logout = async () => {
    loggingOut.set(true)
    const result = await uiSessionLogout()
    loggingOut.set(false)
    if (!result.success) {
      uiToastAdd({
        tone: "negative",
        title: ttc("Sign out failed", "Abmelden fehlgeschlagen"),
        description: result.errorMessage,
      })
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
    accountLabel: () => accountName(),
    projectLabel: () => projectName() || projectId(),
    projectPath,
    breadcrumbPage,
    assetQuery,
    routeMode,
    canSwitchView: () => projectId() !== "" && session().principal?.mode === "admin",
    adminViewPath: () =>
      canonicalRoute()
        ? uiPaths.admin.project(route.organizationSlug(), route.projectSlug())
        : uiPaths.admin.project(projectId()),
    contributorViewPath: () =>
      canonicalRoute()
        ? uiPaths.contributor.project(route.organizationSlug(), route.projectSlug())
        : uiPaths.contributor.project(projectId()),
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
