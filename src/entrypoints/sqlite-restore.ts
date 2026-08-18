import * as v from "valibot"

import { sqliteSnapshotReceiptRead } from "../backup/sqliteSnapshotReceiptRead.js"
import { sqliteSnapshotRestore } from "../backup/sqliteSnapshotRestore.js"
import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { storageBindingSchema } from "../storage/storageBindingSchema.js"

export const sqliteRestoreMain = async (): Promise<number> => {
  const config = serviceConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)
  const receiptPath = process.env.ASSETS_SQLITE_RECEIPT_PATH
  const targetPath = process.env.ASSETS_SQLITE_RESTORE_TARGET
  if (receiptPath === undefined || targetPath === undefined)
    return operationFailure("ASSETS_SQLITE_RECEIPT_PATH and ASSETS_SQLITE_RESTORE_TARGET are required")
  const receipt = await sqliteSnapshotReceiptRead(receiptPath)
  if (!receipt.success) return operationFailure(receipt.errorMessage)
  const projectId = process.env.ASSETS_OPERATIONS_PROJECT_ID
  const prefix = process.env.ASSETS_OPERATIONS_PREFIX
  if (projectId === undefined || prefix === undefined)
    return operationFailure("SQLite restore storage binding is not configured")
  const binding = v.safeParse(storageBindingSchema, {
    projectId,
    environment: config.data.environment,
    bucket: config.data.r2PrivateBucket ?? config.data.r2Bucket,
    prefix,
    publicBaseUrl: process.env.ASSETS_OPERATIONS_PUBLIC_BASE_URL ?? config.data.r2PublicBaseUrl,
  })
  if (!binding.success) return operationFailure(v.summarize(binding.issues))
  const storage = r2StorageAdapterCreate({
    accountId: config.data.r2AccountId,
    accessKeyId: config.data.r2AccessKeyId,
    secretAccessKey: config.data.r2SecretAccessKey,
    endpoint: config.data.r2Endpoint,
    defaultBucket: config.data.r2Bucket,
    allowedBuckets: [config.data.r2Bucket, config.data.r2PrivateBucket].filter(
      (bucket): bucket is string => bucket !== undefined,
    ),
  })
  const restored = await sqliteSnapshotRestore({
    receipt: receipt.data,
    targetPath,
    snapshotPath: process.env.ASSETS_SQLITE_SNAPSHOT_PATH,
    storage,
    binding: binding.output,
  })
  if (!restored.success) return operationFailure(restored.errorMessage)
  process.stdout.write(`${JSON.stringify({ restored: true, targetPath })}\n`)
  return 0
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(await sqliteRestoreMain())
