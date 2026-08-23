import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const structureFolderTable = sqliteTable(
  "structure_folders",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => structureFolderTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    depth: integer("depth").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("structure_folders_project_parent_name_unique").on(
      table.projectId,
      sql`coalesce(${table.parentId}, '')`,
      table.name,
    ),
    index("structure_folders_project_parent_index").on(table.projectId, table.parentId),
    check("structure_folders_depth_check", sql`${table.depth} BETWEEN 1 AND 3`),
  ],
)
