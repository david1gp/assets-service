import { and, eq, gt } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"

type JobRepositoryHeartbeatInput = {
  jobId: string
  workerId: string
  now?: Date | string
  leaseMs?: number
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryHeartbeat = (db: AssetDatabase, input: JobRepositoryHeartbeatInput): Result<Job> => {
  const now = isoDateCreate(input.now)
  const leaseMs = input.leaseMs ?? 60_000
  if (!Number.isInteger(leaseMs) || leaseMs <= 0)
    return resultErrorCreate("jobRepositoryHeartbeat", "Lease duration is invalid")

  return databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const leaseExpiresAt = new Date(new Date(now).getTime() + leaseMs).toISOString()
      const updated = transaction
        .update(jobTable)
        .set({ leaseExpiresAt, heartbeatAt: now, updatedAt: now })
        .where(
          and(
            eq(jobTable.id, input.jobId),
            eq(jobTable.status, "running"),
            eq(jobTable.leaseOwner, input.workerId),
            gt(jobTable.leaseExpiresAt, now),
          ),
        )
        .returning()
        .get()
      if (updated === undefined) return resultErrorCreate("jobRepositoryHeartbeat", "The job lease is no longer owned")
      return { success: true, data: updated as Job }
    },
    { behavior: "immediate" },
  )
}
