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
import { uiStructureFolderFilterOptionsRead } from "../structure/uiStructureFolderFilterOptionsRead.js"
import { uiStructureFolderPathsStateCreate } from "../structure/uiStructureFolderPathsStateCreate.js"
import { uiAssetDisplayOptionCreate } from "./uiAssetDisplayOptionCreate.js"
import { uiAssetPreviewPreferencePersistenceCreate } from "./uiAssetPreviewPreferencePersistenceCreate.js"
import { uiAssetViewPreferencePersistenceCreate } from "./uiAssetViewPreferencePersistenceCreate.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

export { uiAssetClassOptions } from "./uiAssetClassOptions.js"

const uiAssetViewTabSchema = v.picklist(uiAssetViewTabs)
type UiAssetViewTab = v.InferOutput<typeof uiAssetViewTabSchema>
const uiAssetFolderDialogSchema = v.picklist(["folder"])
const uiAssetFolderPreferenceKey = "assets-service:ui:asset-list:show-folders"
const uiAssetFolderAssignmentPreferenceKey = "assets-service:ui:asset-list:show-folder-assignment"

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
  const tabState = createSignalObject<UiAssetViewTab>("list")
  const viewPreferencePersistence = uiAssetViewPreferencePersistenceCreate()
  const hydratedViewPreference = viewPreferencePersistence.hydrate()
  if (hydratedViewPreference.success && hydratedViewPreference.data !== undefined)
    tabState.set(hydratedViewPreference.data)
  const tab = tabState.get
  const tabSignal: SignalObject<UiAssetViewTab> = {
    get: tabState.get,
    set: (value) => {
      const parsed = v.safeParse(uiAssetViewTabSchema, value)
      if (!parsed.success) return
      tabState.set(parsed.output)
      void viewPreferencePersistence.persist(parsed.output)
      setSearchParams({ cursor: null }, { replace: true })
    },
  }

  const showPreviewsState = createSignalObject(false)
  const previewPreferencePersistence = uiAssetPreviewPreferencePersistenceCreate()
  const hydratedPreviewPreference = previewPreferencePersistence.hydrate()
  if (hydratedPreviewPreference.success && hydratedPreviewPreference.data !== undefined)
    showPreviewsState.set(hydratedPreviewPreference.data)
  const showPreviews: SignalObject<boolean> = {
    get: showPreviewsState.get,
    set: (value) => {
      showPreviewsState.set(value)
      void previewPreferencePersistence.persist(value)
    },
  }

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

  const filtersUrlReplace = () => {
    // The search string is read per call instead of from a snapshot so that
    // router updates that happened in between are preserved.
    const pending = new URLSearchParams(window.location.search)
    const values = filterUrlValuesRead()
    for (const [key, value] of Object.entries(values)) {
      if (value === null) pending.delete(key)
      else pending.set(key, value)
    }
    void uiSearchParamsReplace(pending).then((result) => {
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
  })

  const folderClear = () => {
    folderDraftState.set("")
    filtersUrlReplace()
  }

  // Hiding folders also removes the folder filter control, so the active folder
  // filter is dropped with it; an unreachable filter would silently hide assets.
  const showFolders = uiAssetDisplayOptionCreate(uiAssetFolderPreferenceKey, true, (enabled) => {
    if (!enabled) folderClear()
  })
  const showFolderAssignment = uiAssetDisplayOptionCreate(uiAssetFolderAssignmentPreferenceKey, true)
  const folderPaths = uiStructureFolderPathsStateCreate({ projectId, isEnabled: showFolders.get })
  const folderOptions = createMemo(() =>
    uiStructureFolderFilterOptionsRead(folderPaths.paths(), folderDraftState.get()),
  )

  const structure = uiAssetStructureStateCreate({
    projectId,
    // Keep the membership snapshot warm in list mode while assignment controls
    // are visible. Both tabs then read and reconcile the same structure cache.
    isActive: () => tab() === "structure" || (showFolders.get() && showFolderAssignment.get()),
    filters: () => ({
      ...(assetClass() === undefined ? {} : { class: assetClass() }),
      ...(folder() === undefined ? {} : { folder: folder() }),
      ...(search() === undefined ? {} : { search: search() }),
    }),
    isFolderDialogOpen: () =>
      uiSearchParamPicklistRead(uiAssetFolderDialogSchema, searchParams.folderDialog) === "folder",
    folderDialogOpenSet: (open) => setSearchParams({ folderDialog: open ? "folder" : null }),
  })

  const query = uiQueryCreate<AssetListResponse | null>(
    async () => {
      if (tab() !== "list") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetListPageRead", client.errorMessage)
      return client.data.assetListRead(projectId(), {
        limit: 100,
        include: "history,metadata",
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
    showPreviews,
    showFolders,
    showFolderAssignment,
    /** Only meaningful while folders are shown at all. */
    isFolderAssignmentVisible: () => showFolders.get() && showFolderAssignment.get(),
    folderOptions,
    structure,
    query,
    searchDraft,
    folderDraft,
    classDraft,
    hasFilters,
    assetClass: () => assetClass(),
    folder: () => folder(),
    search: () => search(),
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    applyFilters: () => filtersUrlReplace(),
    clearFilters: () => {
      searchDraftState.set("")
      folderDraftState.set("")
      classDraftState.set("all")
      filtersUrlReplace()
    },
    clearSearch: () => {
      searchDraftState.set("")
      filtersUrlReplace()
    },
    clearFolder: folderClear,
    clearClass: () => {
      classDraftState.set("all")
      filtersUrlReplace()
    },
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
