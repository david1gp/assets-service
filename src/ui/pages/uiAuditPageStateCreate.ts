import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { auditEventListQuerySchema } from "../../api-client/auditEventListQuerySchema.js"
import {
  type AuditEventListResponse,
  auditEventListResponseSchema,
} from "../../api-client/auditEventListResponseSchema.js"
import { type AuditAction, auditActionCatalog } from "../../audit/auditActionCatalog.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiProjectRouteContextRead } from "../routing/uiProjectRouteContextRead.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamSchemaRead } from "../search/uiSearchParamSchemaRead.js"
import { uiSearchParamsReplace } from "../search/uiSearchParamsReplace.js"
import { uiAuditActionSelectionUpdate } from "./uiAuditActionSelectionUpdate.js"

type UiAuditActionSelection = AuditAction | "all"

/** Loads the audit trail of one project filtered by action. */
export const uiAuditPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const route = uiProjectRouteContextRead()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => route?.projectId() ?? params.projectId)
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const actionSchema = auditEventListQuerySchema.entries.action
  const action = createMemo(() => uiSearchParamSchemaRead(actionSchema, searchParams.action))
  const actionSelectionRead = (): UiAuditActionSelection[] => {
    const selectedAction = action()
    if (selectedAction === undefined) return ["all"]
    return selectedAction.split(",") as AuditAction[]
  }
  const actionDraftState = createSignalObject<UiAuditActionSelection[]>(actionSelectionRead())
  let pendingActionSearchParams = new URLSearchParams(window.location.search)

  const actionDraftValueRead = () => {
    const selectedActions = actionDraftState.get().filter((value): value is AuditAction => value !== "all")
    return selectedActions.length === 0 ? undefined : selectedActions.join(",")
  }

  const actionUrlValuesRead = () => {
    const value = uiSearchParamSchemaRead(actionSchema, actionDraftValueRead())
    return { action: value ?? null, cursor: null }
  }

  const actionUrlReplace = () => {
    const value = uiSearchParamSchemaRead(actionSchema, actionDraftValueRead())
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
    set: (value: UiAuditActionSelection[]) => {
      actionDraftState.set(uiAuditActionSelectionUpdate(actionDraftState.get(), value))
    },
  }

  createEffect(() => {
    actionDraftState.set(actionSelectionRead())
    pendingActionSearchParams = new URLSearchParams(window.location.search)
  })

  const query = uiQueryCreate<AuditEventListResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success)
        return resultErrorCreate(
          "uiAuditPageRead",
          ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"),
        )
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
    actionOptions: () => ["all", ...auditActionCatalog] satisfies UiAuditActionSelection[],
    hasFilter: () => action() !== undefined,
    applyFilter: actionUrlReplace,
    clearFilter: () => {
      actionDraftState.set(["all"])
      actionUrlReplace()
    },
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => cursor() === undefined,
    goToNextPage: () => setSearchParams({ cursor: query.data()?.page.nextCursor ?? null }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
  }
}
