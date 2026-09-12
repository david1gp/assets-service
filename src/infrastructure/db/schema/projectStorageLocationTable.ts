import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const projectStorageLocationTable = sqliteTable(
  "project_storage_locations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environment: text("environment", { enum: ["development", "production"] }).notNull(),
    bucket: text("bucket").notNull(),
    prefix: text("prefix").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("project_storage_locations_project_environment_bucket_prefix_unique").on(
      table.projectId,
      table.environment,
      table.bucket,
      table.prefix,
    ),
    index("project_storage_locations_project_index").on(table.projectId),
    check("project_storage_locations_environment_check", sql`${table.environment} IN ('development', 'production')`),
  ],
)
