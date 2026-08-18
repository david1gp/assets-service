import type { AnySQLiteTable } from "drizzle-orm/sqlite-core"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { AssetDatabase } from "./assetDatabase.js"

export const databaseRecordInsert = <TTable extends AnySQLiteTable>(
  db: AssetDatabase,
  table: TTable,
  values: InferInsertModel<TTable>,
): Result<InferSelectModel<TTable>> => {
  const op = "databaseRecordInsert"

  try {
    const record = db
      .insert(table)
      .values(values as never)
      .returning()
      .get()
    return { success: true, data: record as InferSelectModel<TTable> }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
