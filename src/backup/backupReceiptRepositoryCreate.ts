import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import type { BackupReceipt } from "./backupReceiptSchema.js"

export const backupReceiptRepositoryCreate = (db: AssetDatabase, receipt: BackupReceipt) =>
  databaseRecordInsert(db, backupReceiptTable, receipt)
