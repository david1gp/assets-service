import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { environmentNameSchema } from "../../schemas/environmentNameSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { type UiCatalogView, uiCatalogViewSchema } from "./uiCatalogViewSchema.js"

/** Loads the current catalog and its generated lists for one environment. */
export const uiCatalogPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const environment = createMemo(
    () => uiSearchParamPicklistRead(environmentNameSchema, searchParams.environment) ?? "development",
  )
  const selectEnvironment = (value: string) => {
    const environmentValue = uiSearchParamPicklistRead(environmentNameSchema, value)
    if (environmentValue === undefined) return
    setSearchParams({ environment: environmentValue }, { replace: true })
  }
  const environmentSignal: SignalObject<string> = { get: environment, set: selectEnvironment }

  const query = uiQueryCreate<UiCatalogView>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiCatalogPageRead", client.errorMessage)
      const catalog = await client.data.catalogCurrentOptionalRead(projectId(), environment())
      if (!catalog.success) return catalog
      if (catalog.data === null) return { success: true, data: { catalog: null, lists: null } }
      const lists = await client.data.catalogListsOptionalRead(projectId(), environment())
      if (!lists.success) return lists
      if (lists.data === null) return { success: true, data: { catalog: null, lists: null } }
      return { success: true, data: { catalog: catalog.data, lists: lists.data } }
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("catalog", projectId(), environment()),
      cacheSchema: uiCatalogViewSchema,
    },
  )

  return {
    query,
    environmentSignal,
  }
}
