import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { auditEventListQuerySchema } from "../../api-client/auditEventListQuerySchema.js"
import {
  type AuditEventListResponse,
  auditEventListResponseSchema,
} from "../../api-client/auditEventListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"

/** Loads the audit trail of one project filtered by action. */
export const uiAuditPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const actionSchema = auditEventListQuerySchema.entries.action
  const action = createMemo(() => uiSearchParamSchemaRead(actionSchema, searchParams.action))
  const actionDraftState = createSignalObject(action() ?? "")
  let pendingActionSearchParams = new URLSearchParams(window.location.search)

  const actionUrlValuesRead = () => {
    const value = uiSearchParamSchemaRead(actionSchema, actionDraftState.get())
    return { action: value ?? null, cursor: null }
  }

  const actionUrlReplace = () => {
    const value = uiSearchParamSchemaRead(actionSchema, actionDraftState.get())
    if (value === undefined) pendingActionSearchParams.delete("action")
    else pendingActionSearchParams.set("action", value)
    pendingActionSearchParams.delete("cursor")
    void uiSearchParamsReplace(pendingActionSearchParams).then((result) => {
      if (!result.success) return
      setSearchParams(actionUrlValuesRead(), { replace: true })
    })
  }

  const actionDraft = {
    get: actionDraftState.get,
    set: (value: string) => {
      actionDraftState.set(value)
      actionUrlReplace()
    },
  }

  createEffect(() => {
    actionDraftState.set(action() ?? "")
    pendingActionSearchParams = new URLSearchParams(window.location.search)
  })

  const query = uiQueryCreate<AuditEventListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAuditPageRead", client.errorMessage)
      return client.data.auditEventListRead(projectId(), {
        limit: 25,
        ...(action() === undefined ? {} : { action: action() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        uiQueryCacheKeyCreate("audit-events", projectId(), `action=${action() ?? ""}&cursor=${cursor() ?? ""}`),
      cacheSchema: auditEventListResponseSchema,
    },
  )

  return {
    query,
    actionDraft,
    hasFilter: () => action() !== undefined,
    applyFilter: actionUrlReplace,
    clearFilter: () => {
      actionDraftState.set("")
      actionUrlReplace()
    },
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
