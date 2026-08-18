import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type SqliteSnapshotReceipt, sqliteSnapshotReceiptSchema } from "./sqliteSnapshotReceiptSchema.js"

export const sqliteSnapshotReceiptCreate = (input: {
  id: string
  databasePath: string
  snapshotPath: string
  remoteBucket: string
  remoteObjectKey: string
  byteSize: number
  sha256: string
  createdAt: string
}): Result<SqliteSnapshotReceipt> => {
  const op = "sqliteSnapshotReceiptCreate"
  const parsed = v.safeParse(sqliteSnapshotReceiptSchema, {
    schema: "assets.sqlite-snapshot-receipt.v1",
    ...input,
    backupMethod: "sqlite-online-backup",
    sourceJournalMode: "wal",
    integrityCheck: "ok",
    checkResult: "verified",
  })
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
  return { success: true, data: parsed.output }
}
