import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type SqliteSnapshotReceipt, sqliteSnapshotReceiptSchema } from "./sqliteSnapshotReceiptSchema.js"

export const sqliteSnapshotReceiptRead = async (receiptPath: string): Promise<Result<SqliteSnapshotReceipt>> => {
  const op = "sqliteSnapshotReceiptRead"
  if (receiptPath.length === 0) return resultErrorCreate(op, "SQLite receipt path is required")
  try {
    const file = Bun.file(receiptPath)
    if (!(await file.exists())) return resultErrorCreate(op, "SQLite backup receipt does not exist")
    const parsed = v.safeParse(sqliteSnapshotReceiptSchema, await file.json())
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))
    return { success: true, data: parsed.output }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
