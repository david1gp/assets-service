import { and, eq, inArray } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"
import { workflowStatusReconcile } from "./workflowStatusReconcile.js"

type JobRepositoryCancelInput = {
  jobId: string
  now?: Date | string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryCancel = (db: AssetDatabase, input: JobRepositoryCancelInput): Result<Job> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const current = transaction.select().from(jobTable).where(eq(jobTable.id, input.jobId)).get()
      if (current === undefined) return resultErrorCreate("jobRepositoryCancel", `Job not found: ${input.jobId}`)
      if (current.status === "cancelled") return { success: true, data: current as Job }
      if (current.status === "succeeded" || current.status === "dead") {
        return resultErrorCreate("jobRepositoryCancel", "A terminal job cannot be cancelled")
      }

      const updated = transaction
        .update(jobTable)
        .set({
          status: "cancelled",
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now,
        })
        .where(and(eq(jobTable.id, input.jobId), inArray(jobTable.status, ["queued", "running", "retryable"])))
        .returning()
        .get()
      if (updated === undefined) return resultErrorCreate("jobRepositoryCancel", "The job changed concurrently")

      const workflow = workflowStatusReconcile(transaction, updated.workflowId, now)
      if (!workflow.success) return workflow
      return { success: true, data: updated as Job }
    },
    { behavior: "immediate" },
  )
}
