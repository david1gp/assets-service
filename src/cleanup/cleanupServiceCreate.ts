import { rm } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

import type { SqliteSnapshotReceipt } from "../backup/sqliteSnapshotReceiptSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { reconciliationServiceCreate } from "../reconciliation/reconciliationServiceCreate.js"
import type { ReconciliationObject } from "../reconciliation/reconciliationPlanBuild.js"
import type { ReconciliationPlan } from "../reconciliation/reconciliationPlanSchema.js"

type CleanupServiceCreateInput = {
  db: AssetDatabase
  storage: StorageAdapter
  databasePath?: string
  minimumAgeMs?: number
  clock?: () => Date
}

type CleanupLocalFilesInput = {
  workspacePath: string
  temporaryDirectory: string
  backupReceipt: SqliteSnapshotReceipt
  publicationVerified: boolean
  catalogAvailable: boolean
}

export const cleanupServiceCreate = (input: CleanupServiceCreateInput) => {
  const reconciliation = reconciliationServiceCreate(input)

  const plan = (planInput: { objects?: readonly ReconciliationObject[]; now?: Date | string } = {}) =>
    reconciliation.plan(planInput)

  const apply = (applyInput: {
    plan: ReconciliationPlan
    backupReceipt: SqliteSnapshotReceipt
    confirm: boolean
    now?: Date | string
  }) => reconciliation.apply(applyInput)

  const localFilesRemove = async (cleanupInput: CleanupLocalFilesInput): Promise<Result<null>> => {
    const op = "cleanupServiceLocalFilesRemove"
    if (!cleanupInput.publicationVerified) return resultErrorCreate(op, "Publication has not been verified")
    if (!cleanupInput.catalogAvailable) return resultErrorCreate(op, "Catalog availability has not been verified")
    if (cleanupInput.backupReceipt.checkResult !== "verified" || cleanupInput.backupReceipt.integrityCheck !== "ok")
      return resultErrorCreate(op, "A verified SQLite backup receipt is required before cleanup")
    const temporaryDirectory = resolve(cleanupInput.temporaryDirectory)
    const workspace = resolve(
      temporaryDirectory,
      isAbsolute(cleanupInput.workspacePath)
        ? relative(temporaryDirectory, cleanupInput.workspacePath)
        : cleanupInput.workspacePath,
    )
    if (workspace !== temporaryDirectory && !workspace.startsWith(`${temporaryDirectory}/`))
      return resultErrorCreate(op, "Cleanup workspace is outside the configured temporary directory")
    try {
      await rm(workspace, { force: true, recursive: true })
      return { success: true, data: null }
    } catch (error) {
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
    }
  }

  return { plan, apply, localFilesRemove }
}
