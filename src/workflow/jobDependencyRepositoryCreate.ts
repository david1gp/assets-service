import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobDependencyTable } from "../infrastructure/db/schema/jobDependencyTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobDependency } from "./jobDependencySchema.js"

export const jobDependencyRepositoryCreate = (
  db: AssetDatabase,
  dependency: JobDependency,
): Result<typeof jobDependencyTable.$inferSelect> =>
  databaseTransactionRun<typeof jobDependencyTable.$inferSelect>(
    db,
    (transaction) => {
      const op = "jobDependencyRepositoryCreate"
      if (dependency.jobId === dependency.dependsOnJobId) return resultErrorCreate(op, "A job cannot depend on itself")

      const existing = transaction
        .select()
        .from(jobDependencyTable)
        .where(
          and(
            eq(jobDependencyTable.jobId, dependency.jobId),
            eq(jobDependencyTable.dependsOnJobId, dependency.dependsOnJobId),
          ),
        )
        .get()
      if (existing !== undefined) return { success: true, data: existing }

      const job = transaction.select({ id: jobTable.id }).from(jobTable).where(eq(jobTable.id, dependency.jobId)).get()
      if (job === undefined) return resultErrorCreate(op, `Job not found: ${dependency.jobId}`)
      const prerequisite = transaction
        .select({ id: jobTable.id })
        .from(jobTable)
        .where(eq(jobTable.id, dependency.dependsOnJobId))
        .get()
      if (prerequisite === undefined) return resultErrorCreate(op, `Job not found: ${dependency.dependsOnJobId}`)

      const cycle = transaction.get<{ id: string }>(sql`
        WITH RECURSIVE dependency_path(id) AS (
          SELECT ${jobDependencyTable.dependsOnJobId}
          FROM ${jobDependencyTable}
          WHERE ${jobDependencyTable.jobId} = ${dependency.dependsOnJobId}
          UNION
          SELECT ${jobDependencyTable.dependsOnJobId}
          FROM ${jobDependencyTable}
          JOIN dependency_path ON ${jobDependencyTable.jobId} = dependency_path.id
        )
        SELECT id
        FROM dependency_path
        WHERE id = ${dependency.jobId}
        LIMIT 1
      `)
      if (cycle !== undefined) return resultErrorCreate(op, "The dependency would create a cycle")

      return databaseRecordInsert(transaction, jobDependencyTable, dependency)
    },
    { behavior: "immediate" },
  )
