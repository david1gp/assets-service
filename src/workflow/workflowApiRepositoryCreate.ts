import { and, asc, eq, inArray } from "drizzle-orm"
import * as v from "valibot"

import { jobRepositoryCancel } from "./jobRepositoryCancel.js"
import { workflowRepositoryCancel } from "./workflowRepositoryCancel.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { jobSchema } from "./jobSchema.js"
import { workflowSchema } from "./workflowSchema.js"
import type { WorkflowApiRepository } from "./workflowApiRepository.js"

const pageLimitRead = (limit: number | undefined): number => Math.min(100, Math.max(1, limit ?? 50))

export const workflowApiRepositoryCreate = (db: AssetDatabase): WorkflowApiRepository => {
  const workflowRead = (record: typeof workflowTable.$inferSelect): Result<import("./workflowSchema.js").Workflow> => {
    const parsed = v.safeParse(workflowSchema, record)
    if (!parsed.success)
      return resultErrorCreate("workflowApiRepositoryWorkflowRead", "The stored workflow was invalid")
    return { success: true, data: parsed.output }
  }

  const jobRead = (record: typeof jobTable.$inferSelect): Result<import("./jobSchema.js").Job> => {
    const parsed = v.safeParse(jobSchema, record)
    if (!parsed.success) return resultErrorCreate("workflowApiRepositoryJobRead", "The stored job was invalid")
    return { success: true, data: parsed.output }
  }

  const jobsForWorkflowRead = (workflowId: string): Result<readonly import("./jobSchema.js").Job[]> => {
    const records = db
      .select()
      .from(jobTable)
      .where(eq(jobTable.workflowId, workflowId))
      .orderBy(asc(jobTable.id))
      .all()
    const jobs: import("./jobSchema.js").Job[] = []
    for (const record of records) {
      const job = jobRead(record)
      if (!job.success) return job
      jobs.push(job.data)
    }
    return { success: true, data: jobs }
  }

  const workflowDetailRead = (
    projectId: string,
    workflowId: string,
  ): Result<{
    workflow: import("./workflowSchema.js").Workflow
    jobs: readonly import("./jobSchema.js").Job[]
  } | null> => {
    try {
      const record = db
        .select()
        .from(workflowTable)
        .where(and(eq(workflowTable.projectId, projectId), eq(workflowTable.id, workflowId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      const workflow = workflowRead(record)
      if (!workflow.success) return workflow
      const jobs = jobsForWorkflowRead(record.id)
      if (!jobs.success) return jobs
      return { success: true, data: { workflow: workflow.data, jobs: jobs.data } }
    } catch (error) {
      return resultErrorCreate("workflowApiRepositoryWorkflowRead", "The workflow could not be read", error)
    }
  }

  const jobDetailRead = (
    projectId: string,
    jobId: string,
  ): Result<{
    job: import("./jobSchema.js").Job
    workflow: import("./workflowSchema.js").Workflow
  } | null> => {
    try {
      const record = db
        .select({ job: jobTable, workflow: workflowTable })
        .from(jobTable)
        .innerJoin(workflowTable, eq(workflowTable.id, jobTable.workflowId))
        .where(and(eq(workflowTable.projectId, projectId), eq(jobTable.id, jobId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      const job = jobRead(record.job)
      if (!job.success) return job
      const workflow = workflowRead(record.workflow)
      if (!workflow.success) return workflow
      return { success: true, data: { job: job.data, workflow: workflow.data } }
    } catch (error) {
      return resultErrorCreate("workflowApiRepositoryJobRead", "The job could not be read", error)
    }
  }

  const workflowsRead: WorkflowApiRepository["workflowsRead"] = (projectId, options) => {
    try {
      const conditions = [eq(workflowTable.projectId, projectId)]
      if (options.status !== undefined) conditions.push(eq(workflowTable.status, options.status))
      if (options.kind !== undefined) conditions.push(eq(workflowTable.kind, options.kind))
      if (options.assetId !== undefined) conditions.push(eq(workflowTable.assetId, options.assetId))
      const records = db
        .select()
        .from(workflowTable)
        .where(and(...conditions))
        .orderBy(asc(workflowTable.createdAt), asc(workflowTable.id))
        .all()
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = records.slice(offset, offset + limit + 1)
      const items: import("./workflowSchema.js").Workflow[] = []
      for (const record of selected.slice(0, limit)) {
        const workflow = workflowRead(record)
        if (!workflow.success) return workflow
        items.push(workflow.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("workflowApiRepositoryWorkflowsRead", "The workflows could not be read", error)
    }
  }

  const jobsRead: WorkflowApiRepository["jobsRead"] = (projectId, options) => {
    try {
      const conditions = [eq(workflowTable.projectId, projectId)]
      if (options.status !== undefined) conditions.push(eq(jobTable.status, options.status))
      if (options.kind !== undefined) conditions.push(eq(jobTable.kind, options.kind))
      if (options.workflowId !== undefined) conditions.push(eq(jobTable.workflowId, options.workflowId))
      const records = db
        .select({ job: jobTable })
        .from(jobTable)
        .innerJoin(workflowTable, eq(workflowTable.id, jobTable.workflowId))
        .where(and(...conditions))
        .orderBy(asc(jobTable.createdAt), asc(jobTable.id))
        .all()
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = records.slice(offset, offset + limit + 1)
      const items: import("./jobSchema.js").Job[] = []
      for (const record of selected.slice(0, limit)) {
        const job = jobRead(record.job)
        if (!job.success) return job
        items.push(job.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("workflowApiRepositoryJobsRead", "The jobs could not be read", error)
    }
  }

  const jobRetry = (projectId: string, jobId: string) => {
    const detail = jobDetailRead(projectId, jobId)
    if (!detail.success || detail.data === null) return detail
    if (detail.data.job.status !== "retryable" && detail.data.job.status !== "dead")
      return resultErrorCreate("workflowApiRepositoryJobRetry", "Only failed jobs can be retried")
    const now = new Date().toISOString()
    const updated = db
      .update(jobTable)
      .set({ status: "queued", attempts: 0, availableAt: now, error: null, updatedAt: now })
      .where(
        and(
          eq(jobTable.id, jobId),
          eq(jobTable.workflowId, detail.data.workflow.id),
          inArray(jobTable.status, ["retryable", "dead"]),
        ),
      )
      .returning()
      .get()
    if (updated === undefined) return resultErrorCreate("workflowApiRepositoryJobRetry", "The job changed concurrently")
    db.update(workflowTable)
      .set({ status: "queued", updatedAt: now })
      .where(and(eq(workflowTable.id, detail.data.workflow.id), inArray(workflowTable.status, ["failed", "cancelled"])))
      .run()
    return jobDetailRead(projectId, jobId)
  }

  const workflowRetry = (projectId: string, workflowId: string) => {
    const detail = workflowDetailRead(projectId, workflowId)
    if (!detail.success || detail.data === null) return detail
    if (detail.data.workflow.status !== "failed")
      return resultErrorCreate("workflowApiRepositoryWorkflowRetry", "Only failed workflows can be retried")
    const retryableJobs = detail.data.jobs.filter((job) => job.status === "retryable" || job.status === "dead")
    if (retryableJobs.length === 0)
      return resultErrorCreate("workflowApiRepositoryWorkflowRetry", "The workflow has no failed jobs to retry")
    const now = new Date().toISOString()
    db.update(jobTable)
      .set({ status: "queued", attempts: 0, availableAt: now, error: null, updatedAt: now })
      .where(and(eq(jobTable.workflowId, workflowId), inArray(jobTable.status, ["retryable", "dead"])))
      .run()
    db.update(workflowTable).set({ status: "queued", updatedAt: now }).where(eq(workflowTable.id, workflowId)).run()
    return workflowDetailRead(projectId, workflowId)
  }

  const workflowCancel = (projectId: string, workflowId: string) => {
    const detail = workflowDetailRead(projectId, workflowId)
    if (!detail.success || detail.data === null) return detail
    const cancelled = workflowRepositoryCancel(db, { workflowId })
    if (!cancelled.success) return cancelled
    return workflowDetailRead(projectId, workflowId)
  }

  const jobCancel = (projectId: string, jobId: string) => {
    const detail = jobDetailRead(projectId, jobId)
    if (!detail.success || detail.data === null) return detail
    const cancelled = jobRepositoryCancel(db, { jobId })
    if (!cancelled.success) return cancelled
    return jobDetailRead(projectId, jobId)
  }

  return {
    workflowsRead,
    workflowRead: workflowDetailRead,
    jobsRead,
    jobRead: jobDetailRead,
    workflowRetry,
    workflowCancel,
    jobRetry,
    jobCancel,
  }
}
