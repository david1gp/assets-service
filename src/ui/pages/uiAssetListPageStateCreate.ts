import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { AssetListResponse } from "../../api-client/assetListResponseSchema.js"
import { assetClassSchema } from "../../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { uiSearchParamStringRead } from "../search/uiSearchParamStringRead.js"

export const uiAssetClassOptions = ["all", "image", "video", "font"] as const

/** Holds asset inventory filters, search, and pagination bound to the URL. */
export const uiAssetListPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const assetClass = createMemo(() => uiSearchParamPicklistRead(assetClassSchema, searchParams.class))
  const folder = createMemo(() => uiSearchParamStringRead(searchParams.folder))
  const search = createMemo(() => uiSearchParamStringRead(searchParams.search))
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))

  const searchDraft = createSignalObject(uiSearchParamStringRead(searchParams.search) ?? "")
  const folderDraft = createSignalObject(uiSearchParamStringRead(searchParams.folder) ?? "")
  const classDraft = createSignalObject<string>(assetClass() ?? "all")

  const query = uiQueryCreate<AssetListResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiAssetListPageRead", client.errorMessage)
    return client.data.assetListRead(projectId(), {
      limit: 25,
      ...(assetClass() === undefined ? {} : { class: assetClass() }),
      ...(folder() === undefined ? {} : { folder: folder() }),
      ...(search() === undefined ? {} : { search: search() }),
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

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
    applyFilters: () => {
      const searchValue = searchDraft.get().trim()
      const folderValue = folderDraft.get().trim()
      const classValue = classDraft.get()
      setSearchParams(
        {
          search: searchValue === "" ? null : searchValue,
          folder: folderValue === "" ? null : folderValue,
          class: classValue === "all" ? null : classValue,
          cursor: null,
        },
        { replace: true },
      )
    },
    clearFilters: () => {
      searchDraft.set("")
      folderDraft.set("")
      classDraft.set("all")
      setSearchParams({ search: null, folder: null, class: null, cursor: null }, { replace: true })
    },
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
