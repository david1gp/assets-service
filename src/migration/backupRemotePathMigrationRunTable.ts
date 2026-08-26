import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const backupRemotePathMigrationRunTable = sqliteTable(
  "backup_remote_path_migration_runs",
  {
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status", { enum: ["running", "blocked", "succeeded"] }).notNull(),
    completedReceiptIds: text("completed_receipt_ids", { mode: "json" }).$type<string[]>().notNull(),
    skippedItems: text("skipped_items", { mode: "json" })
      .$type<Array<{ receiptId: string; reason: string }>>()
      .notNull(),
    collisionItems: text("collision_items", { mode: "json" })
      .$type<Array<{ destination: string; receiptIds: string[]; reason: string }>>()
      .notNull(),
    lastError: text("last_error"),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("backup_remote_path_migration_runs_fingerprint_unique").on(table.fingerprint),
    index("backup_remote_path_migration_runs_status_index").on(table.status, table.updatedAt),
    check(
      "backup_remote_path_migration_runs_status_check",
      sql`${table.status} IN ('running', 'blocked', 'succeeded')`,
    ),
    check(
      "backup_remote_path_migration_runs_completed_receipt_ids_check",
      sql`json_valid(${table.completedReceiptIds})`,
    ),
    check("backup_remote_path_migration_runs_skipped_items_check", sql`json_valid(${table.skippedItems})`),
    check("backup_remote_path_migration_runs_collision_items_check", sql`json_valid(${table.collisionItems})`),
  ],
)
