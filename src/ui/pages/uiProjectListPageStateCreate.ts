import { useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { projectListQuerySchema } from "../../api-client/projectListQuerySchema.js"
import { type ProjectListResponse, projectListResponseSchema } from "../../api-client/projectListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"

/** Holds project search and pagination state driven by URL search parameters. */
export const uiProjectListPageStateCreate = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchSchema = projectListQuerySchema.entries.search
  const search = createMemo(() => uiSearchParamSchemaRead(searchSchema, searchParams.search))
  const searchDraftState = createSignalObject(search() ?? "")
  let pendingSearchParams = new URLSearchParams(window.location.search)

  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))

  const searchUrlValuesRead = () => {
    const value = uiSearchParamSchemaRead(searchSchema, searchDraftState.get())
    return { search: value ?? null, cursor: null }
  }

  const searchUrlReplace = () => {
    const value = uiSearchParamSchemaRead(searchSchema, searchDraftState.get())
    if (value === undefined) pendingSearchParams.delete("search")
    else pendingSearchParams.set("search", value)
    pendingSearchParams.delete("cursor")
    void uiSearchParamsReplace(pendingSearchParams).then((result) => {
      if (!result.success) return
      setSearchParams(searchUrlValuesRead(), { replace: true })
    })
  }

  const searchDraft = {
    get: searchDraftState.get,
    set: (value: string) => {
      searchDraftState.set(value)
      searchUrlReplace()
    },
  }

  createEffect(() => {
    searchDraftState.set(search() ?? "")
    pendingSearchParams = new URLSearchParams(window.location.search)
  })

  const query = uiQueryCreate<ProjectListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiProjectListPageRead", client.errorMessage)
      return client.data.projectsRead({
        limit: 25,
        ...(search() === undefined ? {} : { search: search() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("projects", "all", `search=${search() ?? ""}&cursor=${cursor() ?? ""}`),
      cacheSchema: projectListResponseSchema,
    },
  )

  return {
    query,
    searchDraft,
    hasSearch: () => search() !== undefined,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    submitSearch: searchUrlReplace,
    clearSearch: () => {
      searchDraftState.set("")
      searchUrlReplace()
    },
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
