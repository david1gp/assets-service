import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { projectListQuerySchema } from "../../api-client/projectListQuerySchema.js"
import type { ProjectListItem } from "../../api-client/projectListItemSchema.js"
import { type ProjectListResponse, projectListResponseSchema } from "../../api-client/projectListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { ttc } from "../localization/ttc.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiProjectListContributorRedirectProjectIdRead } from "./uiProjectListContributorRedirectProjectIdRead.js"

/** Holds project search and pagination state driven by URL search parameters. */
export const uiProjectListPageStateCreate = () => {
  const navigate = useNavigate()
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
      if (!client.success)
        return resultErrorCreate(
          "uiProjectListPageRead",
          ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"),
        )
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

  const completeAccessibleProjectsQuery = uiQueryCreate<readonly ProjectListItem[]>(async () => {
    const principal = uiSessionStore.get().principal
    if (principal?.mode !== "contributor" || search() !== undefined || cursor() !== undefined)
      return { success: true, data: [] }
    const client = uiApiClientRead()
    if (!client.success)
      return resultErrorCreate(
        "uiProjectListPageRead",
        ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"),
      )
    return client.data.projectsReadAll()
  })

  createEffect(() => {
    const principal = uiSessionStore.get().principal
    const projects = completeAccessibleProjectsQuery.data()
    if (completeAccessibleProjectsQuery.status() !== "ready" || projects === null) return
    const projectId = uiProjectListContributorRedirectProjectIdRead({
      mode: principal?.mode,
      search: search(),
      cursor: cursor(),
      projects,
    })
    if (projectId === null) return
    navigate(uiPaths.contributor.project(projectId), { replace: true })
  })

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
