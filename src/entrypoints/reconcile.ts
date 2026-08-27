import { readFile } from "node:fs/promises"
import * as v from "valibot"

import { sqliteSnapshotReceiptRead } from "../backup/sqliteSnapshotReceiptRead.js"
import { cleanupServiceCreate } from "../cleanup/cleanupServiceCreate.js"
import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { reconciliationPlanSchema } from "../reconciliation/reconciliationPlanSchema.js"

export const reconcileMain = async (): Promise<number> => {
  const config = serviceConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)
  const opened = databaseOpen(config.data.databasePath)
  if (!opened.success) return operationFailure(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) {
    databaseClose(opened.data)
    return operationFailure(migrated.errorMessage)
  }
  const storage = r2StorageAdapterCreate({
    accountId: config.data.r2AccountId,
    accessKeyId: config.data.r2AccessKeyId,
    secretAccessKey: config.data.r2SecretAccessKey,
    endpoint: config.data.r2Endpoint,
  })
  const service = cleanupServiceCreate({ db: opened.data.db, storage, databasePath: config.data.databasePath })
  const planPath = process.env.ASSETS_RECONCILIATION_PLAN_PATH ?? ""
  const shouldApply = process.argv.includes("--apply")
  if (!shouldApply) {
    const planned = await service.plan()
    databaseClose(opened.data)
    if (!planned.success) return operationFailure(planned.errorMessage)
    if (planPath.length > 0) {
      try {
        await Bun.write(planPath, `${JSON.stringify(planned.data)}\n`)
      } catch (error) {
        return operationFailure(error instanceof Error ? error.message : String(error))
      }
    }
    process.stdout.write(`${JSON.stringify(planned.data)}\n`)
    return 0
  }
  const receiptPath = process.env.ASSETS_SQLITE_RECEIPT_PATH
  if (planPath.length === 0 || receiptPath === undefined) {
    databaseClose(opened.data)
    return operationFailure("Apply requires ASSETS_RECONCILIATION_PLAN_PATH and ASSETS_SQLITE_RECEIPT_PATH")
  }
  let planValue: unknown
  try {
    planValue = JSON.parse(await readFile(planPath, "utf8"))
  } catch (error) {
    databaseClose(opened.data)
    return operationFailure(error instanceof Error ? error.message : String(error))
  }
  const plan = v.safeParse(reconciliationPlanSchema, planValue)
  if (!plan.success) {
    databaseClose(opened.data)
    return operationFailure(v.summarize(plan.issues))
  }
  const receipt = await sqliteSnapshotReceiptRead(receiptPath)
  if (!receipt.success) {
    databaseClose(opened.data)
    return operationFailure(receipt.errorMessage)
  }
  const applied = await service.apply({ plan: plan.output, backupReceipt: receipt.data, confirm: true })
  databaseClose(opened.data)
  if (!applied.success) return operationFailure(applied.errorMessage)
  process.stdout.write(`${JSON.stringify(applied.data)}\n`)
  return 0
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(await reconcileMain())
