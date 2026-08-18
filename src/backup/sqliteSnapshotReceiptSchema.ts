import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const sqliteSnapshotReceiptSchema = v.strictObject({
  schema: v.literal("assets.sqlite-snapshot-receipt.v1"),
  id: idSchema,
  databasePath: v.pipe(v.string(), v.minLength(1)),
  snapshotPath: v.pipe(v.string(), v.minLength(1)),
  remoteBucket: v.pipe(v.string(), v.minLength(1)),
  remoteObjectKey: v.pipe(v.string(), v.minLength(1)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
  sha256: sha256Schema,
  backupMethod: v.literal("sqlite-online-backup"),
  sourceJournalMode: v.literal("wal"),
  integrityCheck: v.literal("ok"),
  checkResult: v.literal("verified"),
  createdAt: isoDateSchema,
})

export type SqliteSnapshotReceipt = v.InferOutput<typeof sqliteSnapshotReceiptSchema>
