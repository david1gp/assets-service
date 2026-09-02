import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { workflowJobCreate } from "../workflow/workflowJobCreate.js"
import { workflowRepositoryEnqueue } from "../workflow/workflowRepositoryEnqueue.js"
import type { Workflow } from "../workflow/workflowSchema.js"
import { storageMigrationRepositoryCreate } from "./storageMigrationRepositoryCreate.js"
import type { StorageMigrationCreateInput } from "./storageMigrationCreateInputSchema.js"

type StorageMigrationWorkflowEnqueueOptions = {
  workflowEnqueue?: typeof workflowRepositoryEnqueue
}

export const storageMigrationWorkflowEnqueue = (
  db: AssetDatabase,
  input: StorageMigrationCreateInput & { now?: string; retryLimit?: number },
  options: StorageMigrationWorkflowEnqueueOptions = {},
): Result<{ migrationId: string; workflowId: string }> => {
  const op = "storageMigrationWorkflowEnqueue"
  const retryLimit = input.retryLimit ?? 3
  if (!Number.isInteger(retryLimit) || retryLimit < 0) return resultErrorCreate(op, "Retry limit is invalid")

  const { now: _now, retryLimit: _retryLimit, ...migrationInput } = input
  const now = input.now ?? new Date().toISOString()
  const repository = storageMigrationRepositoryCreate(db, { clock: () => new Date(now) })
  const workflowEnqueue = options.workflowEnqueue ?? workflowRepositoryEnqueue

  return databaseTransactionRun(
    db,
    (transaction) => {
      const migration = repository.storageMigrationCreate(migrationInput, transaction)
      if (!migration.success) return migration
      const workflowId = `workflow-storage-migration-${migration.data.id}`
      const workflow: Workflow = {
        id: workflowId,
        projectId: migration.data.projectId,
        kind: "storage_migration",
        status: migration.data.status === "running" ? "queued" : migration.data.status,
        createdAt: migration.data.createdAt,
        updatedAt: now,
      }
      const job = workflowJobCreate({
        id: `${workflowId}-migrate`,
        workflowId,
        kind: "migrate_storage",
        payload: { storageMigrationId: migration.data.id },
        now,
        retryLimit,
      })
      const enqueued = workflowEnqueue(db, { workflow, jobs: [job] }, transaction)
      if (!enqueued.success) return enqueued
      return { success: true, data: { migrationId: migration.data.id, workflowId } }
    },
    { behavior: "immediate" },
  )
}
