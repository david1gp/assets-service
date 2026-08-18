import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { BackupListResponse } from "../../api-client/backupListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"

/** Loads the verified backup receipts of one project. */
export const uiBackupsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))

  const query = uiQueryCreate<BackupListResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiBackupsPageRead", client.errorMessage)
    return client.data.backupListRead(projectId(), {
      limit: 25,
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

  return {
    query,
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
