import { Database as BunDatabase } from "bun:sqlite"
import { mkdir, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"
import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { sqliteDatabaseIntegrityVerify } from "./sqliteDatabaseIntegrityVerify.js"
import type { SqliteOnlineBackupAdapter } from "./sqliteOnlineBackupAdapter.js"
import { sqliteOnlineBackupAdapterProduction } from "./sqliteOnlineBackupAdapterProduction.js"
import { sqliteSnapshotReceiptCreate } from "./sqliteSnapshotReceiptCreate.js"
import { type SqliteSnapshotReceipt, sqliteSnapshotReceiptSchema } from "./sqliteSnapshotReceiptSchema.js"

type SqliteSnapshotCreateInput = {
  databasePath: string
  snapshotPath: string
  receiptPath: string
  remoteObjectKey: string
  binding: StorageBinding
  storage: StorageAdapter
  id?: string
  now?: Date
  backupAdapter?: SqliteOnlineBackupAdapter
  signal?: AbortSignal
}

export const sqliteSnapshotCreate = async (
  input: SqliteSnapshotCreateInput,
): Promise<Result<SqliteSnapshotReceipt>> => {
  const op = "sqliteSnapshotCreate"
  if (input.databasePath.length === 0 || input.snapshotPath.length === 0 || input.receiptPath.length === 0)
    return resultErrorCreate(op, "SQLite database, snapshot, and receipt paths are required")
  if (input.databasePath === input.snapshotPath)
    return resultErrorCreate(op, "Snapshot path must differ from database path")
  if (input.remoteObjectKey.length === 0) return resultErrorCreate(op, "SQLite remote snapshot key is required")
  if (input.signal?.aborted) return resultErrorCreate(op, "SQLite snapshot was cancelled")

  const journalMode = sqliteJournalModeRead(input.databasePath)
  if (!journalMode.success) return journalMode
  if (journalMode.data !== "wal") return resultErrorCreate(op, "SQLite database must use WAL mode")

  const existing = await existingReceiptRead(input)
  if (!existing.success) return existing
  if (input.id !== undefined && existing.data !== null && existing.data.id === input.id) {
    const verified = await remoteSnapshotVerify(input.storage, input.binding, existing.data)
    if (verified.success) return { success: true, data: existing.data }
  }

  const temporarySnapshotPath = `${input.snapshotPath}.tmp-${crypto.randomUUID()}`
  try {
    await mkdir(dirname(input.snapshotPath), { recursive: true })
    await mkdir(dirname(input.receiptPath), { recursive: true })
    const backedUp = await (input.backupAdapter ?? sqliteOnlineBackupAdapterProduction())({
      databasePath: input.databasePath,
      snapshotPath: temporarySnapshotPath,
      signal: input.signal,
    })
    if (!backedUp.success) return backedUp
    const integrity = sqliteDatabaseIntegrityVerify(temporarySnapshotPath)
    if (!integrity.success) return integrity
    const bytes = new Uint8Array(await Bun.file(temporarySnapshotPath).arrayBuffer())
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    const byteSize = bytes.byteLength
    const remoteLocation = storageObjectLocationCreate(input.binding, "private-source", input.remoteObjectKey)
    if (!remoteLocation.success) return remoteLocation
    const uploaded = await remoteSnapshotEnsure(input.storage, remoteLocation.data, bytes, byteSize, sha256)
    if (!uploaded.success) return uploaded

    await rm(input.snapshotPath, { force: true })
    await rename(temporarySnapshotPath, input.snapshotPath)
    const receipt = sqliteSnapshotReceiptCreate({
      id: input.id ?? `sqlite-backup-${sha256.slice(0, 32)}`,
      databasePath: input.databasePath,
      snapshotPath: input.snapshotPath,
      remoteBucket: remoteLocation.data.bucket,
      remoteObjectKey: remoteLocation.data.objectKey,
      byteSize,
      sha256,
      createdAt: input.now?.toISOString() ?? new Date().toISOString(),
    })
    if (!receipt.success) return receipt
    const written = await receiptWrite(input.receiptPath, receipt.data)
    if (!written.success) return written
    return receipt
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  } finally {
    await rm(temporarySnapshotPath, { force: true }).catch(() => undefined)
  }
}

function sqliteJournalModeRead(databasePath: string): Result<string> {
  const op = "sqliteSnapshotCreateJournalModeRead"
  let database: BunDatabase | undefined
  try {
    database = new BunDatabase(databasePath, { readonly: true })
    const result = database.query("PRAGMA journal_mode").get() as { journal_mode?: unknown } | null
    if (typeof result?.journal_mode !== "string") return resultErrorCreate(op, "SQLite journal mode could not be read")
    return { success: true, data: result.journal_mode.toLowerCase() }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  } finally {
    database?.close(false)
  }
}

async function existingReceiptRead(input: SqliteSnapshotCreateInput): Promise<Result<SqliteSnapshotReceipt | null>> {
  const op = "sqliteSnapshotCreateExistingReceiptRead"
  try {
    const file = Bun.file(input.receiptPath)
    if (!(await file.exists())) return { success: true, data: null }
    const parsed = v.safeParse(sqliteSnapshotReceiptSchema, await file.json())
    if (!parsed.success) return { success: true, data: null }
    if (
      parsed.output.databasePath !== input.databasePath ||
      parsed.output.snapshotPath !== input.snapshotPath ||
      parsed.output.remoteObjectKey !==
        (input.binding.prefix.length > 0
          ? `${input.binding.prefix}/private/source/${input.remoteObjectKey}`
          : `private/source/${input.remoteObjectKey}`)
    )
      return { success: true, data: null }
    const snapshot = Bun.file(input.snapshotPath)
    if (!(await snapshot.exists()) || snapshot.size !== parsed.output.byteSize) return { success: true, data: null }
    const bytes = new Uint8Array(await snapshot.arrayBuffer())
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    if (sha256 !== parsed.output.sha256) return { success: true, data: null }
    const integrity = sqliteDatabaseIntegrityVerify(input.snapshotPath)
    if (!integrity.success) return { success: true, data: null }
    return { success: true, data: parsed.output }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

async function remoteSnapshotEnsure(
  storage: StorageAdapter,
  location: Parameters<NonNullable<StorageAdapter["headObject"]>>[0],
  bytes: Uint8Array,
  byteSize: number,
  sha256: string,
): Promise<Result<null>> {
  const existing = await remoteSnapshotVerifyByLocation(storage, location, byteSize, sha256)
  if (existing.success) return existing
  const uploaded = await storage.putImmutable({
    location,
    bytes,
    mediaType: "application/vnd.sqlite3",
    sha256,
  })
  if (!uploaded.success) {
    const raced = await remoteSnapshotVerifyByLocation(storage, location, byteSize, sha256)
    if (raced.success) return raced
    return uploaded
  }
  return remoteSnapshotVerifyByLocation(storage, location, byteSize, sha256)
}

async function remoteSnapshotVerify(
  storage: StorageAdapter,
  binding: StorageBinding,
  receipt: SqliteSnapshotReceipt,
): Promise<Result<null>> {
  const keyPrefix = binding.prefix.length > 0 ? `${binding.prefix}/private/source/` : "private/source/"
  if (!receipt.remoteObjectKey.startsWith(keyPrefix))
    return resultErrorCreate(
      "sqliteSnapshotRemoteVerify",
      "SQLite receipt remote object is outside the configured private prefix",
    )
  const location = storageObjectLocationCreate(
    binding,
    "private-source",
    receipt.remoteObjectKey.slice(keyPrefix.length),
  )
  if (!location.success) return location
  if (receipt.remoteBucket !== location.data.bucket)
    return resultErrorCreate(
      "sqliteSnapshotRemoteVerify",
      "SQLite receipt remote bucket does not match the configured binding",
    )
  return remoteSnapshotVerifyByLocation(storage, location.data, receipt.byteSize, receipt.sha256)
}

async function remoteSnapshotVerifyByLocation(
  storage: StorageAdapter,
  location: Parameters<NonNullable<StorageAdapter["headObject"]>>[0],
  byteSize: number,
  sha256: string,
): Promise<Result<null>> {
  const op = "sqliteSnapshotRemoteVerify"
  const head = await storage.headObject(location)
  if (!head.success) return head
  if (head.data === null || head.data.byteSize !== byteSize)
    return resultErrorCreate(op, "Remote SQLite snapshot is missing or has the wrong size")
  if (head.data.sha256 === sha256) return { success: true, data: null }
  const read = await storage.readObject(location)
  if (!read.success) return read
  if (read.data === null) return resultErrorCreate(op, "Remote SQLite snapshot disappeared during verification")
  const actual = new Bun.CryptoHasher("sha256").update(read.data).digest("hex")
  if (actual !== sha256 || read.data.byteLength !== byteSize)
    return resultErrorCreate(op, "Remote SQLite snapshot checksum does not match")
  return { success: true, data: null }
}

async function receiptWrite(receiptPath: string, receipt: SqliteSnapshotReceipt): Promise<Result<null>> {
  const op = "sqliteSnapshotReceiptWrite"
  const temporaryPath = `${receiptPath}.tmp-${crypto.randomUUID()}`
  try {
    await Bun.write(temporaryPath, `${JSON.stringify(receipt)}\n`)
    await rename(temporaryPath, receiptPath)
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}
