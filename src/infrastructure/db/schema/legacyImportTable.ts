import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, index, check } from "drizzle-orm/sqlite-core"

import type { LegacyImportConflict } from "../../../import/legacyImportConflictSchema.js"
import { projectTable } from "./projectTable.js"

export const legacyImportTable = sqliteTable(
  "legacy_imports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    actorId: text("actor_id").notNull(),
    root: text("root").notNull(),
    environment: text("environment", { enum: ["development", "production"] }).notNull(),
    atomicity: text("atomicity", { enum: ["all_or_nothing", "best_effort"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull(),
    importedCount: integer("imported_count").notNull(),
    conflicts: text("conflicts", { mode: "json" }).$type<LegacyImportConflict[]>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("legacy_imports_project_created_index").on(table.projectId, table.createdAt),
    check("legacy_imports_imported_count_check", sql`${table.importedCount} >= 0`),
    check(
      "legacy_imports_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("legacy_imports_atomicity_check", sql`${table.atomicity} IN ('all_or_nothing', 'best_effort')`),
  ],
)
