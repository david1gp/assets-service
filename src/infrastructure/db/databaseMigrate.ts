import { fileURLToPath } from "node:url"

import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { DatabaseConnection } from "./databaseConnection.js"

const defaultMigrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url))

export const databaseMigrate = (
  connection: DatabaseConnection,
  migrationsFolder = defaultMigrationsFolder,
): Result<null> => {
  const op = "databaseMigrate"

  try {
    migrate(connection.db, { migrationsFolder })
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
