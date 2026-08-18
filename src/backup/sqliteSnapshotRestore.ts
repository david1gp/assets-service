import { copyFile, mkdir, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import { databaseOpenPathRegistry } from "../infrastructure/db/databaseOpenPathRegistry.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import type { SqliteSnapshotReceipt } from "./sqliteSnapshotReceiptSchema.js"
import { sqliteSnapshotRestoreVerify } from "./sqliteSnapshotRestoreVerify.js"

export const sqliteSnapshotRestore = async (input: {
  receipt: SqliteSnapshotReceipt
  targetPath: string
  snapshotPath?: string
  storage?: StorageAdapter
  binding?: StorageBinding
  signal?: AbortSignal
}): Promise<Result<null>> => {
  const op = "sqliteSnapshotRestore"
  if (input.targetPath.length === 0) return resultErrorCreate(op, "SQLite restore target path is required")
  if (input.signal?.aborted) return resultErrorCreate(op, "SQLite restore was cancelled")
  if (databaseOpenPathRegistry.has(input.targetPath))
    return resultErrorCreate(op, "SQLite restore target is open; stop the database service before restoring")
  if ((await Bun.file(`${input.targetPath}-wal`).exists()) || (await Bun.file(`${input.targetPath}-shm`).exists()))
    return resultErrorCreate(
      op,
      "SQLite restore target has active WAL sidecars; stop the database service before restoring",
    )
  const localSnapshotPath = input.snapshotPath ?? input.receipt.snapshotPath
  if (localSnapshotPath === input.targetPath)
    return resultErrorCreate(op, "SQLite restore target must differ from the snapshot")
  try {
    const available = await Bun.file(localSnapshotPath).exists()
    if (!available) {
      if (input.storage === undefined || input.binding === undefined)
        return resultErrorCreate(op, "SQLite snapshot is missing and no private storage adapter was provided")
      const keyPrefix = `${input.binding.prefix}/private/source/`
      if (!input.receipt.remoteObjectKey.startsWith(keyPrefix))
        return resultErrorCreate(op, "SQLite receipt remote object is outside the configured private prefix")
      const remoteKey = input.receipt.remoteObjectKey.slice(keyPrefix.length)
      const location = storageObjectLocationCreate(input.binding, "private-source", remoteKey)
      if (!location.success) return location
      const remote = await input.storage.readObject(location.data)
      if (!remote.success) return remote
      if (remote.data === null) return resultErrorCreate(op, "Private SQLite snapshot does not exist")
      await mkdir(dirname(localSnapshotPath), { recursive: true })
      await Bun.write(localSnapshotPath, remote.data)
    }

    const verified = await sqliteSnapshotRestoreVerify({ receipt: input.receipt, snapshotPath: localSnapshotPath })
    if (!verified.success) return verified
    const temporaryTargetPath = `${input.targetPath}.restore-${crypto.randomUUID()}`
    try {
      await mkdir(dirname(input.targetPath), { recursive: true })
      await copyFile(localSnapshotPath, temporaryTargetPath)
      const temporaryVerified = await sqliteSnapshotRestoreVerify({
        receipt: input.receipt,
        snapshotPath: temporaryTargetPath,
      })
      if (!temporaryVerified.success) return temporaryVerified
      await rename(temporaryTargetPath, input.targetPath)
      await rm(`${input.targetPath}-wal`, { force: true })
      await rm(`${input.targetPath}-shm`, { force: true })
      const restored = await sqliteSnapshotRestoreVerify({ receipt: input.receipt, snapshotPath: input.targetPath })
      if (!restored.success) return restored
      return { success: true, data: null }
    } finally {
      await rm(temporaryTargetPath, { force: true }).catch(() => undefined)
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
