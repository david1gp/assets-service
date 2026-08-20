import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as v from "valibot"
import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { type JobListResponse, jobListResponseSchema } from "../../api-client/jobListResponseSchema.js"
import { type WorkflowListResponse, workflowListResponseSchema } from "../../api-client/workflowListResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { jobStatusSchema } from "../../workflow/jobStatusSchema.js"
import { workflowStatusSchema } from "../../workflow/workflowStatusSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamNumberRead } from "../search/uiSearchParamNumberRead.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiJobsTabs } from "./uiJobsTabs.js"

const uiJobsTabSchema = v.picklist(uiJobsTabs)
type UiJobsTab = v.InferOutput<typeof uiJobsTabSchema>

/** Drives the workflow and job tabs including retry and cancel actions. */
export const uiJobsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const tab = createMemo<UiJobsTab>(() => uiSearchParamPicklistRead(uiJobsTabSchema, searchParams.tab) ?? "workflows")
  const cursor = createMemo(() => uiSearchParamNumberRead(searchParams.cursor))
  const workflowStatus = createMemo(() => uiSearchParamPicklistRead(workflowStatusSchema, searchParams.status))
  const jobStatus = createMemo(() => uiSearchParamPicklistRead(jobStatusSchema, searchParams.status))
  const pending = createSignalObject<string | null>(null)

  const selectTab = (value: string) => {
    const parsed = v.safeParse(uiJobsTabSchema, value)
    if (!parsed.success) return
    setSearchParams(
      { tab: parsed.output === "workflows" ? null : parsed.output, cursor: null, status: null },
      { replace: true },
    )
  }
  const tabSignal: SignalObject<string> = { get: tab, set: selectTab }

  const workflows = uiQueryCreate<WorkflowListResponse | null>(
    async () => {
      if (tabSignal.get() !== "workflows") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiJobsPageWorkflowsRead", client.errorMessage)
      return client.data.workflowListRead(projectId(), {
        limit: 25,
        ...(workflowStatus() === undefined ? {} : { status: workflowStatus() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        tabSignal.get() === "workflows"
          ? uiQueryCacheKeyCreate("workflows", projectId(), `status=${workflowStatus() ?? ""}&cursor=${cursor() ?? ""}`)
          : undefined,
      cacheSchema: v.nullable(workflowListResponseSchema),
    },
  )

  const jobs = uiQueryCreate<JobListResponse | null>(
    async () => {
      if (tabSignal.get() !== "jobs") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiJobsPageJobsRead", client.errorMessage)
      return client.data.jobListRead(projectId(), {
        limit: 25,
        ...(jobStatus() === undefined ? {} : { status: jobStatus() }),
        ...(cursor() === undefined ? {} : { cursor: cursor() }),
      })
    },
    {
      cacheKey: () =>
        tabSignal.get() === "jobs"
          ? uiQueryCacheKeyCreate("jobs", projectId(), `status=${jobStatus() ?? ""}&cursor=${cursor() ?? ""}`)
          : undefined,
      cacheSchema: v.nullable(jobListResponseSchema),
    },
  )

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

  const nextCursor = () =>
    (tabSignal.get() === "jobs" ? jobs.data()?.page.nextCursor : workflows.data()?.page.nextCursor) ?? null

  return {
    projectId,
    tabSignal,
    workflows,
    jobs,
    pendingId: pending.get,
    nextCursor,
    isFirstPage: () => cursor() === undefined,
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
