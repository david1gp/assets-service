import { and, eq, inArray } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { storageMigrationTable } from "../migration/storageMigrationTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type WorkflowRepositoryCancelInput = {
  workflowId: string
  now?: Date | string
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const workflowRepositoryCancel = (
  db: AssetDatabase,
  input: WorkflowRepositoryCancelInput,
): Result<typeof workflowTable.$inferSelect> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<typeof workflowTable.$inferSelect>(
    db,
    (transaction) => {
      const workflow = transaction.select().from(workflowTable).where(eq(workflowTable.id, input.workflowId)).get()
      if (workflow === undefined)
        return resultErrorCreate("workflowRepositoryCancel", `Workflow not found: ${input.workflowId}`)
      if (workflow.status === "cancelled") return { success: true, data: workflow }
      if (workflow.status === "succeeded" || workflow.status === "failed") {
        return resultErrorCreate("workflowRepositoryCancel", "A terminal workflow cannot be cancelled")
      }

      transaction
        .update(jobTable)
        .set({
          status: "cancelled",
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now,
        })
        .where(
          and(eq(jobTable.workflowId, input.workflowId), inArray(jobTable.status, ["queued", "running", "retryable"])),
        )
        .run()

      const migrationJob = transaction
        .select({ payload: jobTable.payload })
        .from(jobTable)
        .where(and(eq(jobTable.workflowId, input.workflowId), eq(jobTable.kind, "migrate_storage")))
        .get()
      const migrationId = migrationJob?.payload.storageMigrationId
      if (typeof migrationId === "string")
        transaction
          .update(storageMigrationTable)
          .set({
            status: "cancelled",
            lastError: "The storage migration was cancelled",
            updatedAt: now,
            completedAt: now,
          })
          .where(
            and(
              eq(storageMigrationTable.id, migrationId),
              inArray(storageMigrationTable.status, ["queued", "running"]),
            ),
          )
          .run()

      const updated = transaction
        .update(workflowTable)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(workflowTable.id, input.workflowId), inArray(workflowTable.status, ["queued", "running"])))
        .returning()
        .get()
      if (updated === undefined)
        return resultErrorCreate("workflowRepositoryCancel", "The workflow changed concurrently")
      return { success: true, data: updated }
    },
    { behavior: "immediate" },
  )
}
