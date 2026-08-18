import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import type { Result } from "../schemas/resultSchema.js"
import { jobErrorCreate } from "./jobErrorCreate.js"
import { workflowStatusReconcile } from "./workflowStatusReconcile.js"

type JobRepositoryRecoverExpiredLeasesInput = {
  now?: Date | string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryRecoverExpiredLeases = (
  db: AssetDatabase,
  input: JobRepositoryRecoverExpiredLeasesInput = {},
): Result<number> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<number>(
    db,
    (transaction) => {
      const expired = transaction
        .select()
        .from(jobTable)
        .where(and(eq(jobTable.status, "running"), sql`${jobTable.leaseExpiresAt} <= ${now}`))
        .all()
      const workflowIds = new Set<string>()
      let recoveredCount = 0

      for (const job of expired) {
        if (job.leaseExpiresAt === null) continue
        const retryable = job.attempts <= job.retryLimit
        const updated = transaction
          .update(jobTable)
          .set({
            status: retryable ? "retryable" : "dead",
            availableAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            error: jobErrorCreate("The job lease expired", retryable),
            updatedAt: now,
          })
          .where(
            and(
              eq(jobTable.id, job.id),
              eq(jobTable.status, "running"),
              eq(jobTable.leaseExpiresAt, job.leaseExpiresAt),
            ),
          )
          .returning({ id: jobTable.id })
          .get()
        if (updated === undefined) continue
        workflowIds.add(job.workflowId)
        recoveredCount += 1
      }

      for (const workflowId of workflowIds) {
        const workflow = workflowStatusReconcile(transaction, workflowId, now)
        if (!workflow.success) return workflow
      }
      return { success: true, data: recoveredCount }
    },
    { behavior: "immediate" },
  )
}
