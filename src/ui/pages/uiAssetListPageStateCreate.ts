import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { assetListQuerySchema } from "../../api-client/assetListQuerySchema.js"
import { type AssetListResponse, assetListResponseSchema } from "../../api-client/assetListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"

export { uiAssetClassOptions } from "./uiAssetClassOptions.js"

/** Holds asset inventory filters, search, and pagination bound to the URL. */
export const uiAssetListPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const classSchema = assetListQuerySchema.entries.class
  const folderSchema = assetListQuerySchema.entries.folder
  const searchSchema = assetListQuerySchema.entries.search
  const assetClass = createMemo(() => uiSearchParamSchemaRead(classSchema, searchParams.class))
  const folder = createMemo(() => uiSearchParamSchemaRead(folderSchema, searchParams.folder))
  const search = createMemo(() => uiSearchParamSchemaRead(searchSchema, searchParams.search))
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))

  const searchDraftState = createSignalObject(search() ?? "")
  const folderDraftState = createSignalObject(folder() ?? "")
  const classDraftState = createSignalObject<string>(assetClass() ?? "all")
  let pendingFilterSearchParams = new URLSearchParams(window.location.search)

  const filterUrlValuesRead = () => {
    const searchValue = uiSearchParamSchemaRead(searchSchema, searchDraftState.get())
    const folderValue = uiSearchParamSchemaRead(folderSchema, folderDraftState.get())
    const classValue =
      classDraftState.get() === "all" ? undefined : uiSearchParamSchemaRead(classSchema, classDraftState.get())
    return {
      search: searchValue ?? null,
      folder: folderValue ?? null,
      class: classValue ?? null,
      cursor: null,
    }
  }

  const filtersUrlReplace = () => {
    const values = filterUrlValuesRead()
    for (const [key, value] of Object.entries(values)) {
      if (value === null) pendingFilterSearchParams.delete(key)
      else pendingFilterSearchParams.set(key, value)
    }
    void uiSearchParamsReplace(pendingFilterSearchParams).then((result) => {
      if (!result.success) return
      setSearchParams(filterUrlValuesRead(), { replace: true })
    })
  }

  const searchDraft = {
    get: searchDraftState.get,
    set: (value: string) => {
      searchDraftState.set(value)
      filtersUrlReplace()
    },
  }
  const folderDraft = {
    get: folderDraftState.get,
    set: (value: string) => {
      folderDraftState.set(value)
      filtersUrlReplace()
    },
  }
  const classDraft = {
    get: classDraftState.get,
    set: (value: string) => {
      classDraftState.set(value)
      filtersUrlReplace()
    },
  }

  createEffect(() => {
    searchDraftState.set(search() ?? "")
    folderDraftState.set(folder() ?? "")
    classDraftState.set(assetClass() ?? "all")
    pendingFilterSearchParams = new URLSearchParams(window.location.search)
  })

  const query = uiQueryCreate<AssetListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetListPageRead", client.errorMessage)
      return client.data.assetListRead(projectId(), {
        limit: 25,
        ...(assetClass() === undefined ? {} : { class: assetClass() }),
        ...(folder() === undefined ? {} : { folder: folder() }),
        ...(search() === undefined ? {} : { search: search() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        uiQueryCacheKeyCreate(
          "assets",
          projectId(),
          `class=${assetClass() ?? ""}&folder=${folder() ?? ""}&search=${search() ?? ""}&cursor=${cursor() ?? ""}`,
        ),
      cacheSchema: assetListResponseSchema,
    },
  )

  const hasFilters = () => assetClass() !== undefined || folder() !== undefined || search() !== undefined

  return {
    projectId,
    query,
    searchDraft,
    folderDraft,
    classDraft,
    hasFilters,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    applyFilters: filtersUrlReplace,
    clearFilters: () => {
      searchDraftState.set("")
      folderDraftState.set("")
      classDraftState.set("all")
      filtersUrlReplace()
    },
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
