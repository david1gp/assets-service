import type { ServiceConfig } from "../config/serviceConfigSchema.js"
import type { DoctorCheckResult } from "./doctorCheckResult.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import type { Result } from "../schemas/resultSchema.js"

export const sqliteDoctorCheckCreate =
  (config: Pick<ServiceConfig, "databasePath">) => (): Result<DoctorCheckResult> => {
    const connection = databaseOpen(config.databasePath)
    if (!connection.success) return connection
    try {
      const foreignKeys = connection.data.client.query("PRAGMA foreign_keys").get() as { foreign_keys?: number }
      const journalMode = connection.data.client.query("PRAGMA journal_mode").get() as { journal_mode?: string }
      const tables = connection.data.client
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name?: string }>
      if (foreignKeys.foreign_keys !== 1 || journalMode.journal_mode?.toLowerCase() !== "wal") {
        return {
          success: false,
          op: "sqliteDoctorCheckCreate",
          errorMessage: "SQLite foreign keys or WAL mode was not enabled",
          rawData: { foreignKeys: foreignKeys.foreign_keys, journalMode: journalMode.journal_mode },
        }
      }
      const requiredTables = ["projects", "uploads", "jobs"]
      const missingTables = requiredTables.filter((name) => !tables.some((table) => table.name === name))
      if (missingTables.length > 0)
        return {
          success: false,
          op: "sqliteDoctorCheckCreate",
          errorMessage: "SQLite migrations were not applied",
          rawData: { missingTables },
        }
      return { success: true, data: { message: "SQLite is open with foreign keys and WAL enabled" } }
    } finally {
      connection.data.client.close()
    }
  }
