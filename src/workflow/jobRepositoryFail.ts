import { and, eq } from "drizzle-orm"

import type { StructuredError } from "../api/structuredErrorSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"
import { workflowStatusReconcile } from "./workflowStatusReconcile.js"

type JobRepositoryFailInput = {
  jobId: string
  workerId: string
  error: StructuredError
  now?: Date | string
  backoffMs?: number
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryFail = (db: AssetDatabase, input: JobRepositoryFailInput): Result<Job> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const current = transaction.select().from(jobTable).where(eq(jobTable.id, input.jobId)).get()
      if (current === undefined) return resultErrorCreate("jobRepositoryFail", `Job not found: ${input.jobId}`)
      if (current.status !== "running" || current.leaseOwner !== input.workerId) {
        return resultErrorCreate("jobRepositoryFail", "The job lease is no longer owned")
      }

      const retryable = input.error.retryable && current.attempts <= current.retryLimit
      const backoffMs = input.backoffMs ?? Math.min(300_000, 1_000 * 2 ** Math.max(0, current.attempts - 1))
      if (!Number.isInteger(backoffMs) || backoffMs < 0)
        return resultErrorCreate("jobRepositoryFail", "Backoff is invalid")
      const updated = transaction
        .update(jobTable)
        .set({
          status: retryable ? "retryable" : "dead",
          availableAt: retryable ? new Date(new Date(now).getTime() + backoffMs).toISOString() : now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          error: { ...input.error, retryable },
          updatedAt: now,
        })
        .where(
          and(eq(jobTable.id, input.jobId), eq(jobTable.status, "running"), eq(jobTable.leaseOwner, input.workerId)),
        )
        .returning()
        .get()
      if (updated === undefined) return resultErrorCreate("jobRepositoryFail", "The job lease is no longer owned")

      const workflow = workflowStatusReconcile(transaction, updated.workflowId, now)
      if (!workflow.success) return workflow
      return { success: true, data: updated as Job }
    },
    { behavior: "immediate" },
  )
}
