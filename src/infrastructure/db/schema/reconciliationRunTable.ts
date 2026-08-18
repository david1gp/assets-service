import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const reconciliationRunTable = sqliteTable(
  "reconciliation_runs",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    status: text("status", { enum: ["running", "succeeded"] }).notNull(),
    completedItemIds: text("completed_item_ids", { mode: "json" }).$type<string[]>().notNull(),
    deletedObjectKeys: text("deleted_object_keys", { mode: "json" }).$type<string[]>().notNull(),
    skippedItems: text("skipped_items", { mode: "json" }).$type<Array<{ itemId: string; reason: string }>>().notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("reconciliation_runs_plan_unique").on(table.planId),
    index("reconciliation_runs_status_index").on(table.status, table.updatedAt),
    check("reconciliation_runs_status_check", sql`${table.status} IN ('running', 'succeeded')`),
    check("reconciliation_runs_completed_item_ids_check", sql`json_valid(${table.completedItemIds})`),
    check("reconciliation_runs_deleted_object_keys_check", sql`json_valid(${table.deletedObjectKeys})`),
    check("reconciliation_runs_skipped_items_check", sql`json_valid(${table.skippedItems})`),
  ],
)
