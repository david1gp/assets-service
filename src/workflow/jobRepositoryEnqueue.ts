import { eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobDependency } from "./jobDependencySchema.js"
import type { Job } from "./jobSchema.js"

type JobRepositoryEnqueueInput = {
  job: Job
  dependencies?: readonly JobDependency[]
}

export const jobRepositoryEnqueue = (db: AssetDatabase, input: JobRepositoryEnqueueInput): Result<Job> =>
  databaseTransactionRun<Job>(
    db,
    (transaction) => {
      const op = "jobRepositoryEnqueue"
      const existing = transaction
        .select()
        .from(jobTable)
        .where(eq(jobTable.idempotencyKey, input.job.idempotencyKey))
        .get()
      if (existing !== undefined) {
        if (existing.workflowId !== input.job.workflowId || existing.kind !== input.job.kind) {
          return resultErrorCreate(op, `Idempotency key already belongs to another job: ${input.job.idempotencyKey}`)
        }
        return { success: true, data: existing as Job }
      }

      const inserted = databaseRecordInsert(transaction, jobTable, input.job)
      if (!inserted.success) return inserted as Result<Job>

      for (const dependency of input.dependencies ?? []) {
        if (dependency.jobId !== input.job.id) {
          return resultErrorCreate(op, `Dependency does not belong to job: ${dependency.id}`)
        }
        const dependencyInsert = databaseRecordInsert(transaction, jobDependencyTable, dependency)
        if (!dependencyInsert.success) return dependencyInsert as Result<Job>
      }

      return { success: true, data: inserted.data as Job }
    },
    { behavior: "immediate" },
  )
