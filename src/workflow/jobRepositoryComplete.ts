import { and, eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"
import { workflowStatusReconcile } from "./workflowStatusReconcile.js"

type JobRepositoryCompleteInput = {
  jobId: string
  workerId: string
  now?: Date | string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryComplete = (db: AssetDatabase, input: JobRepositoryCompleteInput): Result<Job> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const updated = transaction
        .update(jobTable)
        .set({
          status: "succeeded",
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          error: null,
          updatedAt: now,
        })
        .where(
          and(eq(jobTable.id, input.jobId), eq(jobTable.status, "running"), eq(jobTable.leaseOwner, input.workerId)),
        )
        .returning()
        .get()
      if (updated === undefined) return resultErrorCreate("jobRepositoryComplete", "The job lease is no longer owned")

      const workflow = workflowStatusReconcile(transaction, updated.workflowId, now)
      if (!workflow.success) return workflow
      return { success: true, data: updated as Job }
    },
    { behavior: "immediate" },
  )
}
