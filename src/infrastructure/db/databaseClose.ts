import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { DatabaseConnection } from "./databaseConnection.js"
import { databaseOpenPathRegistry } from "./databaseOpenPathRegistry.js"

export const databaseClose = (connection: DatabaseConnection): Result<null> => {
  const op = "databaseClose"

  try {
    connection.client.close()
    databaseOpenPathRegistry.unregister(connection.databasePath)
    return { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
