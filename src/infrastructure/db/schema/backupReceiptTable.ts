import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { jobTable } from "./jobTable.js"
import { projectTable } from "./projectTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"

export const backupReceiptTable = sqliteTable(
  "backup_receipts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sourceRevisionId: text("source_revision_id")
      .notNull()
      .references(() => sourceRevisionTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobTable.id, { onDelete: "restrict", onUpdate: "cascade" }),
    remotePath: text("remote_path").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    checkResult: text("check_result", { enum: ["verified", "failed"] }).notNull(),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("backup_receipts_verified_source_unique")
      .on(table.sourceRevisionId)
      .where(sql`${table.checkResult} = 'verified'`),
    index("backup_receipts_project_index").on(table.projectId),
    index("backup_receipts_source_revision_index").on(table.sourceRevisionId),
    check("backup_receipts_check_result_check", sql`${table.checkResult} IN ('verified', 'failed')`),
    check("backup_receipts_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
