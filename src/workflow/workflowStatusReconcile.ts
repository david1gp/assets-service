import { and, eq, inArray } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const workflowStatusReconcile = (
  db: AssetDatabase,
  workflowId: string,
  updatedAt: string,
): Result<typeof workflowTable.$inferSelect> => {
  const op = "workflowStatusReconcile"
  const workflow = db.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()
  if (workflow === undefined) return resultErrorCreate(op, `Workflow not found: ${workflowId}`)
  if (workflow.status === "succeeded" || workflow.status === "failed" || workflow.status === "cancelled") {
    return { success: true, data: workflow }
  }

  const jobs = db.select({ status: jobTable.status }).from(jobTable).where(eq(jobTable.workflowId, workflowId)).all()
  if (jobs.length === 0) return { success: true, data: workflow }

  const nextStatus = jobs.some((job) => job.status === "dead")
    ? "failed"
    : jobs.some((job) => job.status === "queued" || job.status === "running" || job.status === "retryable")
      ? "running"
      : jobs.some((job) => job.status === "cancelled")
        ? "cancelled"
        : "succeeded"

  if (workflow.status === nextStatus) return { success: true, data: workflow }

  const updated = db
    .update(workflowTable)
    .set({ status: nextStatus, updatedAt })
    .where(and(eq(workflowTable.id, workflowId), inArray(workflowTable.status, ["queued", "running"])))
    .returning()
    .get()
  if (updated === undefined) return resultErrorCreate(op, `Workflow status changed concurrently: ${workflowId}`)
  return { success: true, data: updated }
}
