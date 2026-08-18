import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { auditEventTable } from "../infrastructure/db/schema/auditEventTable.js"
import type { AuditEvent } from "./auditEventSchema.js"

export const auditEventRepositoryAppend = (db: AssetDatabase, event: AuditEvent) =>
  databaseRecordInsert(db, auditEventTable, {
    ...event,
    details: event.details,
  })
