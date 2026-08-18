import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobDependency } from "./jobDependencySchema.js"
import type { Job } from "./jobSchema.js"
import type { Workflow } from "./workflowSchema.js"

type WorkflowRepositoryEnqueueInput = {
  workflow: Workflow
  jobs: readonly Job[]
  dependencies?: readonly JobDependency[]
}

type WorkflowRepositoryEnqueueResult = {
  workflow: typeof workflowTable.$inferSelect
  jobs: Array<typeof jobTable.$inferSelect>
}

export const workflowRepositoryEnqueue = (
  db: AssetDatabase,
  input: WorkflowRepositoryEnqueueInput,
): Result<WorkflowRepositoryEnqueueResult> =>
  databaseTransactionRun<WorkflowRepositoryEnqueueResult>(
    db,
    (transaction) => {
      const op = "workflowRepositoryEnqueue"
      const existingWorkflow = transaction
        .select()
        .from(workflowTable)
        .where(eq(workflowTable.id, input.workflow.id))
        .get()
      let workflow: typeof workflowTable.$inferSelect

      if (existingWorkflow !== undefined) {
        if (
          existingWorkflow.projectId !== input.workflow.projectId ||
          existingWorkflow.kind !== input.workflow.kind ||
          existingWorkflow.assetId !== (input.workflow.assetId ?? null) ||
          existingWorkflow.sourceRevisionId !== (input.workflow.sourceRevisionId ?? null)
        ) {
          return resultErrorCreate(op, `Workflow identity already belongs to another workflow: ${input.workflow.id}`)
        }
        workflow = existingWorkflow
      } else {
        const insertedWorkflow = databaseRecordInsert(transaction, workflowTable, input.workflow)
        if (!insertedWorkflow.success) return insertedWorkflow as Result<WorkflowRepositoryEnqueueResult>
        workflow = insertedWorkflow.data
      }

      const jobs: Array<typeof jobTable.$inferSelect> = []
      const jobIds = new Map<string, string>()
      for (const job of input.jobs) {
        if (job.workflowId !== input.workflow.id)
          return resultErrorCreate(op, `Job belongs to another workflow: ${job.id}`)

        const existingJob = transaction
          .select()
          .from(jobTable)
          .where(eq(jobTable.idempotencyKey, job.idempotencyKey))
          .get()
        if (existingJob !== undefined) {
          if (existingJob.workflowId !== job.workflowId || existingJob.kind !== job.kind) {
            return resultErrorCreate(op, `Idempotency key already belongs to another job: ${job.idempotencyKey}`)
          }
          jobs.push(existingJob)
          jobIds.set(job.id, existingJob.id)
          continue
        }

        const insertedJob = databaseRecordInsert(transaction, jobTable, job)
        if (!insertedJob.success) return insertedJob as Result<WorkflowRepositoryEnqueueResult>
        jobs.push(insertedJob.data)
        jobIds.set(job.id, insertedJob.data.id)
      }

      for (const dependency of input.dependencies ?? []) {
        const jobId = jobIds.get(dependency.jobId) ?? dependency.jobId
        const dependsOnJobId = jobIds.get(dependency.dependsOnJobId) ?? dependency.dependsOnJobId
        if (jobId === dependsOnJobId) return resultErrorCreate(op, "A job cannot depend on itself")

        const existingDependency = transaction
          .select()
          .from(jobDependencyTable)
          .where(and(eq(jobDependencyTable.jobId, jobId), eq(jobDependencyTable.dependsOnJobId, dependsOnJobId)))
          .get()
        if (existingDependency !== undefined) continue

        const dependencyJob = transaction.select({ id: jobTable.id }).from(jobTable).where(eq(jobTable.id, jobId)).get()
        const prerequisite = transaction
          .select({ id: jobTable.id })
          .from(jobTable)
          .where(eq(jobTable.id, dependsOnJobId))
          .get()
        if (dependencyJob === undefined || prerequisite === undefined) {
          return resultErrorCreate(op, "Every dependency must reference an existing job")
        }

        const cycle = transaction.get<{ id: string }>(sql`
          WITH RECURSIVE dependency_path(id) AS (
            SELECT ${jobDependencyTable.dependsOnJobId}
            FROM ${jobDependencyTable}
            WHERE ${jobDependencyTable.jobId} = ${dependsOnJobId}
            UNION
            SELECT ${jobDependencyTable.dependsOnJobId}
            FROM ${jobDependencyTable}
            JOIN dependency_path ON ${jobDependencyTable.jobId} = dependency_path.id
          )
          SELECT id
          FROM dependency_path
          WHERE id = ${jobId}
          LIMIT 1
        `)
        if (cycle !== undefined) return resultErrorCreate(op, "The dependency would create a cycle")

        const insertedDependency = databaseRecordInsert(transaction, jobDependencyTable, {
          ...dependency,
          id: dependency.id,
          jobId,
          dependsOnJobId,
        })
        if (!insertedDependency.success) return insertedDependency as Result<WorkflowRepositoryEnqueueResult>
      }

      return { success: true, data: { workflow, jobs } }
    },
    { behavior: "immediate" },
  )
