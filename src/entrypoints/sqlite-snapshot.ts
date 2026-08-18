import * as v from "valibot"

import { sqliteSnapshotCreate } from "../backup/sqliteSnapshotCreate.js"
import { serviceConfigRead } from "../config/serviceConfigRead.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { storageBindingSchema } from "../storage/storageBindingSchema.js"

export const sqliteSnapshotMain = async (): Promise<number> => {
  const config = serviceConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)
  const projectId = process.env.ASSETS_OPERATIONS_PROJECT_ID
  const prefix = process.env.ASSETS_OPERATIONS_PREFIX
  const remoteObjectKey = process.env.ASSETS_SQLITE_REMOTE_OBJECT_KEY
  if (projectId === undefined || prefix === undefined || remoteObjectKey === undefined)
    return operationFailure(
      "ASSETS_OPERATIONS_PROJECT_ID, ASSETS_OPERATIONS_PREFIX, and ASSETS_SQLITE_REMOTE_OBJECT_KEY are required",
    )
  const binding = v.safeParse(storageBindingSchema, {
    projectId,
    environment: config.data.environment,
    bucket: config.data.r2PrivateBucket ?? config.data.r2Bucket,
    prefix,
    publicBaseUrl: process.env.ASSETS_OPERATIONS_PUBLIC_BASE_URL ?? config.data.r2PublicBaseUrl,
  })
  if (!binding.success) return operationFailure(v.summarize(binding.issues))
  const snapshotPath = process.env.ASSETS_SQLITE_SNAPSHOT_PATH ?? `${config.data.databasePath}.snapshot`
  const receiptPath = process.env.ASSETS_SQLITE_RECEIPT_PATH ?? `${snapshotPath}.receipt.json`
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
  const result = await sqliteSnapshotCreate({
    databasePath: config.data.databasePath,
    snapshotPath,
    receiptPath,
    remoteObjectKey,
    binding: binding.output,
    storage,
    ...(process.env.ASSETS_SQLITE_BACKUP_ID ? { id: process.env.ASSETS_SQLITE_BACKUP_ID } : {}),
  })
  if (!result.success) return operationFailure(result.errorMessage)
  process.stdout.write(`${JSON.stringify(result.data)}\n`)
  return 0
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(await sqliteSnapshotMain())
