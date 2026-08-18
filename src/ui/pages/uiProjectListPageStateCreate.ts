import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { ProjectListResponse } from "../../api-client/projectListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamStringRead } from "../search/uiSearchParamStringRead.js"

/** Holds project search and pagination state driven by URL search parameters. */
export const uiProjectListPageStateCreate = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchDraft = createSignalObject(uiSearchParamStringRead(searchParams.search) ?? "")

  const search = createMemo(() => uiSearchParamStringRead(searchParams.search))
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))

  const query = uiQueryCreate<ProjectListResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiProjectListPageRead", client.errorMessage)
    return client.data.projectsRead({
      limit: 25,
      ...(search() === undefined ? {} : { search: search() }),
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

  return {
    query,
    searchDraft,
    hasSearch: () => search() !== undefined,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    submitSearch: () => {
      const value = searchDraft.get().trim()
      setSearchParams({ search: value === "" ? null : value, cursor: null }, { replace: true })
    },
    clearSearch: () => {
      searchDraft.set("")
      setSearchParams({ search: null, cursor: null }, { replace: true })
    },
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
