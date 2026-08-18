import { Database as BunDatabase } from "bun:sqlite"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const sqliteDatabaseIntegrityVerify = (databasePath: string): Result<null> => {
  const op = "sqliteDatabaseIntegrityVerify"
  if (databasePath.length === 0) return resultErrorCreate(op, "SQLite database path is required")
  let database: BunDatabase | undefined
  try {
    database = new BunDatabase(databasePath, { readonly: true })
    const integrity = database.query("PRAGMA integrity_check").all() as Array<{ integrity_check?: unknown }>
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok")
      return resultErrorCreate(op, "SQLite integrity check failed", integrity)
    const foreignKeys = database.query("PRAGMA foreign_key_check").all()
    if (foreignKeys.length > 0) return resultErrorCreate(op, "SQLite foreign key check failed", foreignKeys)
    const migrations = database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
      .get()
    if (migrations === null || migrations === undefined)
      return resultErrorCreate(op, "SQLite migrations table is missing")
    const requiredTables = [
      "assets",
      "blobs",
      "backup_receipts",
      "catalogs",
      "jobs",
      "outbox_events",
      "legacy_imports",
      "deletion_states",
      "reconciliation_runs",
    ]
    const placeholders = requiredTables.map(() => "?").join(",")
    const present = database
      .query(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
      .get(...requiredTables) as { count?: unknown } | null
    if (present?.count !== requiredTables.length)
      return resultErrorCreate(op, "SQLite task tables are missing from the snapshot")
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  } finally {
    database?.close(false)
  }
}
