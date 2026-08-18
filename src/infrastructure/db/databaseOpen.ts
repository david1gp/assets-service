import { Database as BunDatabase } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { DatabaseConnection } from "./databaseConnection.js"
import { databaseOpenPathRegistry } from "./databaseOpenPathRegistry.js"
import { databaseSchema } from "./schema/databaseSchema.js"

export const databaseOpen = (path: string): Result<DatabaseConnection> => {
  const op = "databaseOpen"

  try {
    const client = new BunDatabase(path)
    client.exec("PRAGMA foreign_keys = ON")
    client.exec("PRAGMA journal_mode = WAL")
    client.exec("PRAGMA synchronous = NORMAL")
    client.exec("PRAGMA busy_timeout = 5000")

    databaseOpenPathRegistry.register(path)
    return { success: true, data: { client, db: drizzle(client, { schema: databaseSchema }), databasePath: path } }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
