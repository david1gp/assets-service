import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobKind } from "./jobKindSchema.js"
import type { Job } from "./jobSchema.js"
import { workflowStatusReconcile } from "./workflowStatusReconcile.js"

type JobRepositoryClaimInput = {
  workerId: string
  now?: Date | string
  leaseMs?: number
  kinds?: readonly JobKind[]
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryClaim = (db: AssetDatabase, input: JobRepositoryClaimInput): Result<Job | null> => {
  const now = isoDateCreate(input.now)
  const leaseMs = input.leaseMs ?? 60_000
  if (input.workerId.length === 0) return resultErrorCreate("jobRepositoryClaim", "Worker ID is required")
  if (!Number.isInteger(leaseMs) || leaseMs <= 0)
    return resultErrorCreate("jobRepositoryClaim", "Lease duration is invalid")
  if (input.kinds !== undefined && input.kinds.length === 0) return { success: true, data: null }

  const leaseExpiresAt = new Date(new Date(now).getTime() + leaseMs).toISOString()
  return databaseTransactionRun<Job | null>(
    db,
    (transaction) => {
      const op = "jobRepositoryClaim"
      const candidate = transaction
        .select()
        .from(jobTable)
        .where(
          and(
            inArray(jobTable.status, ["queued", "retryable"]),
            sql`${jobTable.availableAt} <= ${now}`,
            input.kinds === undefined ? undefined : inArray(jobTable.kind, input.kinds),
            sql`EXISTS (
              SELECT 1
              FROM workflows AS workflow
              WHERE workflow.id = ${jobTable.workflowId}
                AND workflow.status IN ('queued', 'running')
            )`,
            sql`NOT EXISTS (
              SELECT 1
              FROM job_dependencies AS dependency
              JOIN jobs AS prerequisite ON prerequisite.id = dependency.depends_on_job_id
              WHERE dependency.job_id = ${jobTable.id}
                AND prerequisite.status <> 'succeeded'
            )`,
          ),
        )
        .orderBy(desc(jobTable.priority), asc(jobTable.availableAt), asc(jobTable.createdAt))
        .limit(1)
        .get()
      if (candidate === undefined) return { success: true, data: null }

      const job = transaction
        .update(jobTable)
        .set({
          status: "running",
          attempts: sql`${jobTable.attempts} + 1`,
          leaseOwner: input.workerId,
          leaseExpiresAt,
          heartbeatAt: now,
          error: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobTable.id, candidate.id),
            inArray(jobTable.status, ["queued", "retryable"]),
            sql`${jobTable.availableAt} <= ${now}`,
          ),
        )
        .returning()
        .get()
      if (job === undefined) return resultErrorCreate(op, `Claimed job changed concurrently: ${candidate.id}`)
      const workflow = workflowStatusReconcile(transaction, job.workflowId, now)
      if (!workflow.success) return workflow
      return { success: true, data: job as Job }
    },
    { behavior: "immediate" },
  )
}
