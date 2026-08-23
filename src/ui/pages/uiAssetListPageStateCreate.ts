import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { assetListQuerySchema } from "../../api-client/assetListQuerySchema.js"
import { type AssetListResponse, assetListResponseSchema } from "../../api-client/assetListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"
import { uiAssetStructureStateCreate } from "../structure/uiAssetStructureStateCreate.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

export { uiAssetClassOptions } from "./uiAssetClassOptions.js"

const uiAssetViewTabSchema = v.picklist(uiAssetViewTabs)
type UiAssetViewTab = v.InferOutput<typeof uiAssetViewTabSchema>
const uiAssetFolderDialogSchema = v.picklist(["folder"])

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
  const tab = createMemo<UiAssetViewTab>(
    () => uiSearchParamPicklistRead(uiAssetViewTabSchema, searchParams.tab) ?? "list",
  )
  const tabSignal: SignalObject<string> = {
    get: tab,
    set: (value) => {
      const parsed = v.safeParse(uiAssetViewTabSchema, value)
      if (!parsed.success) return
      setSearchParams({ tab: parsed.output === "list" ? null : parsed.output, cursor: null }, { replace: true })
      // A debounced filter replacement may still be scheduled with the previous
      // tab. Rescheduling it with the new tab keeps the URL and the tab state
      // consistent because the latest scheduled replacement wins.
      filtersUrlReplace(parsed.output)
    },
  }

  const structure = uiAssetStructureStateCreate({
    projectId,
    isActive: () => tab() === "structure",
    filters: () => ({
      ...(assetClass() === undefined ? {} : { class: assetClass() }),
      ...(folder() === undefined ? {} : { folder: folder() }),
      ...(search() === undefined ? {} : { search: search() }),
    }),
    isFolderDialogOpen: () =>
      uiSearchParamPicklistRead(uiAssetFolderDialogSchema, searchParams.folderDialog) === "folder",
    folderDialogOpenSet: (open) => setSearchParams({ folderDialog: open ? "folder" : null }),
  })

  const searchDraftState = createSignalObject(search() ?? "")
  const folderDraftState = createSignalObject(folder() ?? "")
  const classDraftState = createSignalObject<string>(assetClass() ?? "all")
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

  const filtersUrlReplace = (nextTab?: UiAssetViewTab) => {
    // The search string is read per call instead of from a snapshot so that tab
    // changes and router updates that happened in between are preserved.
    const pending = new URLSearchParams(window.location.search)
    const values = { ...filterUrlValuesRead(), tab: (nextTab ?? tab()) === "list" ? null : (nextTab ?? tab()) }
    for (const [key, value] of Object.entries(values)) {
      if (value === null) pending.delete(key)
      else pending.set(key, value)
    }
    void uiSearchParamsReplace(pending).then((result) => {
      if (!result.success) return
      // The router does not observe the raw history replacement, so the tab is
      // re-asserted here to stop a stale router snapshot from dropping it.
      setSearchParams({ ...filterUrlValuesRead(), tab: values.tab }, { replace: true })
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
  })

  const query = uiQueryCreate<AssetListResponse | null>(
    async () => {
      if (tab() !== "list") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetListPageRead", client.errorMessage)
      return client.data.assetListRead(projectId(), {
        limit: 100,
        ...(assetClass() === undefined ? {} : { class: assetClass() }),
        ...(folder() === undefined ? {} : { folder: folder() }),
        ...(search() === undefined ? {} : { search: search() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        tab() === "list"
          ? uiQueryCacheKeyCreate(
              "assets",
              projectId(),
              `class=${assetClass() ?? ""}&folder=${folder() ?? ""}&search=${search() ?? ""}&cursor=${cursor() ?? ""}`,
            )
          : undefined,
      cacheSchema: v.nullable(assetListResponseSchema),
    },
  )

  const hasFilters = () => assetClass() !== undefined || folder() !== undefined || search() !== undefined

  return {
    projectId,
    tabSignal,
    structure,
    query,
    searchDraft,
    folderDraft,
    classDraft,
    hasFilters,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    applyFilters: () => filtersUrlReplace(),
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
