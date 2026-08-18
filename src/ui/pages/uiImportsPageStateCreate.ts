import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { LegacyImportListResponse } from "../../api-client/legacyImportListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

/** Lists legacy imports and starts new import requests. */
export const uiImportsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const root = createSignalObject("")
  const pending = createSignalObject(false)
  const errorMessage = createSignalObject<string | null>(null)

  const query = uiQueryCreate<LegacyImportListResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiImportsPageRead", client.errorMessage)
    return client.data.importListRead(projectId(), {
      limit: 25,
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

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
    uiToastAdd({ tone: "positive", title: "Import queued" })
    query.reload()
  }

  return {
    query,
    root,
    isPending: pending.get,
    errorMessage: errorMessage.get,
    start,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
