import { sql } from "drizzle-orm"
import { sqliteTable, text, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { projectTable } from "./projectTable.js"

export const workflowTable = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id").references(() => assetTable.id, { onDelete: "set null", onUpdate: "cascade" }),
    kind: text("kind", { enum: ["asset_processing", "catalog_generation", "deletion", "cleanup"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workflows_project_status_index").on(table.projectId, table.status),
    index("workflows_asset_index").on(table.assetId),
    check(
      "workflows_kind_check",
      sql`${table.kind} IN ('asset_processing', 'catalog_generation', 'deletion', 'cleanup')`,
    ),
    check("workflows_status_check", sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`),
  ],
)
