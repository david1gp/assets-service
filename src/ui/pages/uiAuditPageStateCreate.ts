import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { AuditEventListResponse } from "../../api-client/auditEventListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamStringRead } from "../search/uiSearchParamStringRead.js"

/** Loads the audit trail of one project filtered by action. */
export const uiAuditPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const action = createMemo(() => uiSearchParamStringRead(searchParams.action))
  const actionDraft = createSignalObject(uiSearchParamStringRead(searchParams.action) ?? "")

  const query = uiQueryCreate<AuditEventListResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiAuditPageRead", client.errorMessage)
    return client.data.auditEventListRead(projectId(), {
      limit: 25,
      ...(action() === undefined ? {} : { action: action() }),
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

  return {
    query,
    actionDraft,
    hasFilter: () => action() !== undefined,
    applyFilter: () => {
      const value = actionDraft.get().trim()
      setSearchParams({ action: value === "" ? null : value, cursor: null }, { replace: true })
    },
    clearFilter: () => {
      actionDraft.set("")
      setSearchParams({ action: null, cursor: null }, { replace: true })
    },
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
