import type { SQLiteTransactionConfig } from "drizzle-orm/sqlite-core/session"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { AssetDatabase } from "./assetDatabase.js"

export const databaseTransactionRun = <T>(
  db: AssetDatabase,
  operation: (transaction: AssetDatabase) => Result<T>,
  config?: SQLiteTransactionConfig,
): Result<T> => {
  const op = "databaseTransactionRun"
  let operationResult: Result<T> | undefined

  try {
    db.transaction((transaction) => {
      operationResult = operation(transaction as unknown as AssetDatabase)
      if (!operationResult.success) transaction.rollback()
    }, config)

    if (operationResult === undefined) return resultErrorCreate(op, "The transaction did not return a result")
    return operationResult
  } catch (error) {
    if (operationResult !== undefined && !operationResult.success) return operationResult
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
