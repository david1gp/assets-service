import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { manifestTable } from "../infrastructure/db/schema/manifestTable.js"

export const manifestRepositoryCreate = (db: AssetDatabase, manifest: typeof manifestTable.$inferInsert) =>
  databaseRecordInsert(db, manifestTable, manifest)
