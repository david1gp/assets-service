import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sqliteDatabaseIntegrityVerify } from "./sqliteDatabaseIntegrityVerify.js"
import { type SqliteSnapshotReceipt, sqliteSnapshotReceiptSchema } from "./sqliteSnapshotReceiptSchema.js"

export const sqliteSnapshotRestoreVerify = async (input: {
  receipt: SqliteSnapshotReceipt
  snapshotPath: string
}): Promise<Result<null>> => {
  const op = "sqliteSnapshotRestoreVerify"
  const parsed = v.safeParse(sqliteSnapshotReceiptSchema, input.receipt)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))
  const receipt = parsed.output
  if (receipt.checkResult !== "verified" || receipt.integrityCheck !== "ok")
    return resultErrorCreate(op, "SQLite backup receipt is not verified")
  try {
    const snapshot = Bun.file(input.snapshotPath)
    if (!(await snapshot.exists())) return resultErrorCreate(op, "SQLite snapshot does not exist")
    if (snapshot.size !== receipt.byteSize)
      return resultErrorCreate(op, "SQLite snapshot size does not match its receipt")
    const bytes = new Uint8Array(await snapshot.arrayBuffer())
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    if (sha256 !== receipt.sha256) return resultErrorCreate(op, "SQLite snapshot checksum does not match its receipt")
    return sqliteDatabaseIntegrityVerify(input.snapshotPath)
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
