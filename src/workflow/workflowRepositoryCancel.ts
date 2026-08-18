import { and, eq, inArray } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
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
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now,
        })
        .where(
          and(eq(jobTable.workflowId, input.workflowId), inArray(jobTable.status, ["queued", "running", "retryable"])),
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
