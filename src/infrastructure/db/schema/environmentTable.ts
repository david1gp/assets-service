import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const environmentTable = sqliteTable(
  "environments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name", { enum: ["development", "production"] }).notNull(),
    r2Bucket: text("r2_bucket").notNull(),
    r2Prefix: text("r2_prefix").notNull(),
    publicBaseUrl: text("public_base_url").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("environments_project_name_unique").on(table.projectId, table.name),
    index("environments_project_index").on(table.projectId),
    check("environments_name_check", sql`${table.name} IN ('development', 'production')`),
  ],
)
