import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { JobListResponse } from "../../api-client/jobListResponseSchema.js"
import type { WorkflowListResponse } from "../../api-client/workflowListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { jobStatusSchema } from "../../workflow/jobStatusSchema.js"
import { workflowStatusSchema } from "../../workflow/workflowStatusSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { uiSearchParamStringRead } from "../search/uiSearchParamStringRead.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

export const uiJobsTabs = ["workflows", "jobs"] as const

/** Drives the workflow and job tabs including retry and cancel actions. */
export const uiJobsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const tab = createMemo(() => (uiSearchParamStringRead(searchParams.tab) === "jobs" ? "jobs" : "workflows"))
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const workflowStatus = createMemo(() => uiSearchParamPicklistRead(workflowStatusSchema, searchParams.status))
  const jobStatus = createMemo(() => uiSearchParamPicklistRead(jobStatusSchema, searchParams.status))
  const pending = createSignalObject<string | null>(null)
  const tabSignal = createSignalObject<string>(tab())

  const workflows = uiQueryCreate<WorkflowListResponse | null>(async () => {
    if (tab() !== "workflows") return { success: true, data: null }
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiJobsPageWorkflowsRead", client.errorMessage)
    return client.data.workflowListRead(projectId(), {
      limit: 25,
      ...(workflowStatus() === undefined ? {} : { status: workflowStatus() }),
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

  const jobs = uiQueryCreate<JobListResponse | null>(async () => {
    if (tab() !== "jobs") return { success: true, data: null }
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiJobsPageJobsRead", client.errorMessage)
    return client.data.jobListRead(projectId(), {
      limit: 25,
      ...(jobStatus() === undefined ? {} : { status: jobStatus() }),
      ...(cursor() === undefined ? {} : { cursor: cursor() }),
    })
  })

  const run = async (id: string, label: string, action: () => Promise<Result<unknown>>) => {
    pending.set(id)
    const result = await action()
    pending.set(null)
    if (!result.success) {
      uiToastAdd({ tone: "negative", title: `${label} failed`, description: result.errorMessage })
      return
    }
    uiToastAdd({ tone: "positive", title: `${label} accepted` })
    workflows.reload()
    jobs.reload()
  }

  const clientRead = () => {
    const client = uiApiClientRead()
    return client.success ? client.data : null
  }

  const nextCursor = () => (tab() === "jobs" ? jobs.data()?.page.nextCursor : workflows.data()?.page.nextCursor) ?? null

  return {
    projectId,
    tab,
    tabSignal,
    workflows,
    jobs,
    pendingId: pending.get,
    nextCursor,
    isFirstPage: () => cursor() === undefined,
    selectTab: (value: string) => {
      tabSignal.set(value)
      setSearchParams({ tab: value === "workflows" ? null : value, cursor: null, status: null }, { replace: true })
    },
    goToNextPage: () => setSearchParams({ cursor: nextCursor() }),
    goToFirstPage: () => setSearchParams({ cursor: null }),
    workflowRetry: (id: string) =>
      void run(id, "Workflow retry", async () => {
        const client = clientRead()
        if (!client) return resultErrorCreate("uiJobsPageWorkflowRetry", "The API client is unavailable")
        return client.workflowRetry(projectId(), id)
      }),
    workflowCancel: (id: string) =>
      void run(id, "Workflow cancel", async () => {
        const client = clientRead()
        if (!client) return resultErrorCreate("uiJobsPageWorkflowCancel", "The API client is unavailable")
        return client.workflowCancel(projectId(), id)
      }),
    jobRetry: (id: string) =>
      void run(id, "Job retry", async () => {
        const client = clientRead()
        if (!client) return resultErrorCreate("uiJobsPageJobRetry", "The API client is unavailable")
        return client.jobRetry(projectId(), id)
      }),
    jobCancel: (id: string) =>
      void run(id, "Job cancel", async () => {
        const client = clientRead()
        if (!client) return resultErrorCreate("uiJobsPageJobCancel", "The API client is unavailable")
        return client.jobCancel(projectId(), id)
      }),
  }
}
