import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { CatalogResponse } from "../../api-client/catalogResponseSchema.js"
import type { GeneratedListsResponse } from "../../api-client/generatedListsResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamStringRead } from "../search/uiSearchParamStringRead.js"

export const uiCatalogEnvironments = ["development", "production"] as const

export type UiCatalogView = { catalog: CatalogResponse; lists: GeneratedListsResponse } | { catalog: null; lists: null }

/** Loads the current catalog and its generated lists for one environment. */
export const uiCatalogPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const environment = createMemo(() => {
    const raw = uiSearchParamStringRead(searchParams.environment)
    return raw === "production" ? "production" : "development"
  })
  const environmentSignal = createSignalObject<string>(environment())

  const query = uiQueryCreate<UiCatalogView>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiCatalogPageRead", client.errorMessage)
    const catalog = await client.data.catalogCurrentOptionalRead(projectId(), environment())
    if (!catalog.success) return catalog
    if (catalog.data === null) return { success: true, data: { catalog: null, lists: null } }
    const lists = await client.data.catalogListsOptionalRead(projectId(), environment())
    if (!lists.success) return lists
    if (lists.data === null) return { success: true, data: { catalog: null, lists: null } }
    return { success: true, data: { catalog: catalog.data, lists: lists.data } }
  })

  return {
    query,
    environment,
    environmentSignal,
    selectEnvironment: (value: string) => {
      environmentSignal.set(value)
      setSearchParams({ environment: value }, { replace: true })
    },
  }
}
