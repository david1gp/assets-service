import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import {
  type AuthOrganizationsResponse,
  authOrganizationsResponseSchema,
} from "../../api-client/authOrganizationsResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiTenantCacheClear } from "./uiTenantCacheClear.js"

/** Holds organization selection, query loading, switching, and cache invalidation state. */
export const uiOrganizationSelectorStateCreate = () => {
  const navigate = useNavigate()
  const switching = createSignalObject(false)
  const selectedOrganizationId = createSignalObject("")

  const session = createMemo(() => uiSessionStore.get())

  const organizationsQuery = uiQueryCreate<AuthOrganizationsResponse | null>(
    async () => {
      if (session().status !== "authenticated") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success)
        return resultErrorCreate(
          "uiOrganizationSelectorRead",
          ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"),
        )
      return client.data.authOrganizationsRead()
    },
    {
      cacheKey: () =>
        session().status === "authenticated" ? uiQueryCacheKeyCreate("organizations", "list") : undefined,
      cacheSchema: v.nullable(authOrganizationsResponseSchema),
    },
  )

  const organizations = createMemo(() => organizationsQuery.data()?.organizations ?? [])
  const currentOrganizationId = createMemo(
    () => organizationsQuery.data()?.currentOrganizationId ?? session().principal?.organizationId ?? "",
  )
  const currentOrganization = createMemo(() => {
    const id = currentOrganizationId()
    const list = organizations()
    return list.find((org) => org.id === id || org.current) ?? null
  })
  const currentOrganizationName = createMemo(() => currentOrganization()?.name ?? currentOrganizationId())

  createEffect(() => {
    if (!switching.get()) selectedOrganizationId.set(currentOrganizationId())
  })

  const showSelector = createMemo(() => organizations().length > 1)
  const showLabel = createMemo(() => organizations().length <= 1 && currentOrganizationId() !== "")

  const switchOrganization = async (targetOrganizationId: string) => {
    if (switching.get()) return
    if (targetOrganizationId === "" || targetOrganizationId === currentOrganizationId()) return

    switching.set(true)
    selectedOrganizationId.set(targetOrganizationId)
    const client = uiApiClientRead()
    if (!client.success) {
      selectedOrganizationId.set(currentOrganizationId())
      switching.set(false)
      uiToastAdd({
        tone: "negative",
        title: ttc("Organization switch failed", "Organisationswechsel fehlgeschlagen"),
        description: client.errorMessage,
      })
      return
    }

    const result = await client.data.authOrganizationSwitch(targetOrganizationId)
    if (!result.success) {
      selectedOrganizationId.set(currentOrganizationId())
      switching.set(false)
      uiToastAdd({
        tone: "negative",
        title: ttc("Organization switch failed", "Organisationswechsel fehlgeschlagen"),
        description: result.errorMessage,
      })
      return
    }

    uiTenantCacheClear()
    uiSessionStore.set({
      status: "authenticated",
      principal: result.data.principal,
      errorMessage: null,
    })

    if (typeof window !== "undefined" && window.location?.search) {
      window.history?.replaceState(null, "", uiPaths.projects)
    }
    navigate(uiPaths.projects, { replace: true })
    organizationsQuery.reload()
    switching.set(false)
  }

  return {
    organizations,
    currentOrganizationId,
    currentOrganizationName,
    selectedOrganizationId: selectedOrganizationId.get,
    showSelector,
    showLabel,
    isSwitching: switching.get,
    switchOrganization,
  }
}
