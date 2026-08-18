import { and, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type JobPayload, jobPayloadSchema } from "./jobPayloadSchema.js"
import type { Job } from "./jobSchema.js"

type JobRepositoryPayloadUpdateInput = {
  jobId: string
  workerId: string
  payload: JobPayload
  now?: Date | string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const jobRepositoryPayloadUpdate = (db: AssetDatabase, input: JobRepositoryPayloadUpdateInput): Result<Job> => {
  const parsed = v.safeParse(jobPayloadSchema, input.payload)
  if (!parsed.success) return resultErrorCreate("jobRepositoryPayloadUpdate", "Job payload is invalid", parsed.issues)
  const now = isoDateCreate(input.now)

  return databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const updated = transaction
        .update(jobTable)
        .set({ payload: parsed.output, updatedAt: now })
        .where(
          and(eq(jobTable.id, input.jobId), eq(jobTable.status, "running"), eq(jobTable.leaseOwner, input.workerId)),
        )
        .returning()
        .get()
      if (updated === undefined)
        return resultErrorCreate("jobRepositoryPayloadUpdate", "The job lease is no longer owned")
      return { success: true, data: updated as Job }
    },
    { behavior: "immediate" },
  )
}
