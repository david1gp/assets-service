import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import {
  type LegacyImportListResponse,
  legacyImportListResponseSchema,
} from "../../api-client/legacyImportListResponseSchema.js"
import { legacyImportRequestSchema } from "../../api-client/legacyImportRequestSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiFormDraftKeyCreate } from "../storage/uiFormDraftKeyCreate.js"
import { uiFormDraftPersistenceCreate } from "../storage/uiFormDraftPersistenceCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

const legacyImportDraftSchema = v.strictObject({
  root: v.union([v.literal(""), legacyImportRequestSchema.entries.root]),
})

type UiLegacyImportDraft = v.InferOutput<typeof legacyImportDraftSchema>

/** Lists legacy imports and starts new import requests. */
export const uiImportsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const root = createSignalObject("")
  const pending = createSignalObject(false)
  const errorMessage = createSignalObject<string | null>(null)

  const draft = uiFormDraftPersistenceCreate<UiLegacyImportDraft>(
    () => uiFormDraftKeyCreate("project", projectId(), "legacy-import"),
    legacyImportDraftSchema,
    () => ({ root: root.get() }),
  )
  const hydratedDraft = draft.hydrate()
  if (hydratedDraft.success && hydratedDraft.data !== undefined) root.set(hydratedDraft.data.root)
  const rootDraft = draft.signalCreate(root)

  const query = uiQueryCreate<LegacyImportListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiImportsPageRead", client.errorMessage)
      return client.data.importListRead(projectId(), {
        limit: 25,
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("imports", projectId(), `cursor=${cursor() ?? ""}`),
      cacheSchema: legacyImportListResponseSchema,
    },
  )

  const start = async () => {
    const value = root.get().trim()
    if (value === "") {
      errorMessage.set("Enter the legacy root directory to import")
      return
    }
    const client = uiApiClientRead()
    if (!client.success) {
      errorMessage.set(client.errorMessage)
      return
    }
    pending.set(true)
    errorMessage.set(null)
    const result = await client.data.importRequestCreate(projectId(), { root: value })
    pending.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      uiToastAdd({ tone: "negative", title: "Import request failed", description: result.errorMessage })
      return
    }
    root.set("")
    await draft.clear()
    uiToastAdd({ tone: "positive", title: "Import queued" })
    query.reload()
  }

  return {
    query,
    root: rootDraft,
    isPending: pending.get,
    errorMessage: errorMessage.get,
    start,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
