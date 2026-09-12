import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { assetListQuerySchema } from "../../api-client/assetListQuerySchema.js"
import { type AssetListResponse, assetListResponseSchema } from "../../api-client/assetListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectRouteContextRead } from "../routing/uiProjectRouteContextRead.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiAssetPreviewSourceRead } from "./uiAssetPreviewSourceRead.js"

/** Holds the contributor asset search, pagination, previews, and customer-facing labels. */
export const uiContributorAssetListPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const route = uiProjectRouteContextRead()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = createMemo(() => route?.projectId() ?? params.projectId)
  const search = createMemo(() => uiSearchParamSchemaRead(assetListQuerySchema.entries.search, searchParams.search))
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const searchDraftState = createSignalObject(search() ?? "")
  const searchDraft = { get: searchDraftState.get, set: (value: string) => searchDraftState.set(value) }

  createEffect(() => searchDraftState.set(search() ?? ""))

  const query = uiQueryCreate<AssetListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiContributorAssetListRead", client.errorMessage)
      return client.data.assetListRead(projectId(), {
        limit: 48,
        include: "history,metadata",
        ...(search() === undefined ? {} : { search: search() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        uiQueryCacheKeyCreate("contributor-assets", projectId(), `search=${search() ?? ""}&cursor=${cursor() ?? ""}`),
      cacheSchema: assetListResponseSchema,
    },
  )

  const previewSourceRead = (asset: AssetListItem) => {
    const client = uiApiClientRead()
    if (!client.success) return null
    return uiAssetPreviewSourceRead(asset, {
      outputVersionUrlCreate: (outputVersionId) =>
        client.data.assetOutputVersionContentUrlCreate(projectId(), asset.id, outputVersionId),
      sourceRevisionPreviewUrlCreate: (sourceRevisionId) =>
        client.data.assetSourceRevisionContentUrlCreate(projectId(), asset.id, sourceRevisionId, "preview"),
    })
  }

  const classLabelRead = (asset: AssetListItem) => {
    if (asset.class === "image") return ttc("Image", "Bild")
    if (asset.class === "video") return ttc("Video", "Video")
    if (asset.class === "font") return ttc("Font", "Schrift")
    return ttc("Document", "Dokument")
  }

  const searchSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    const parsed = v.safeParse(assetListQuerySchema.entries.search, searchDraftState.get().trim())
    setSearchParams({ search: parsed.success ? parsed.output : null, cursor: null }, { replace: true })
  }

  return {
    projectId,
    query,
    searchDraft,
    hasSearch: () => search() !== undefined,
    searchSubmit,
    searchClear: () => setSearchParams({ search: null, cursor: null }, { replace: true }),
    assetPathRead: (assetId: string) => uiPaths.contributor.asset(projectId(), assetId),
    uploadPath: () => uiPaths.contributor.upload(projectId()),
    previewSourceRead,
    classLabelRead,
    isFirstPage: () => cursor() === undefined,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    firstPageOpen: () => setSearchParams({ cursor: null }),
    nextPageOpen: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
  }
}
