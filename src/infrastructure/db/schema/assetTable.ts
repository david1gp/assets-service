import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const assetTable = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    class: text("class", { enum: ["image", "video", "font"] }).notNull(),
    folder1: text("folder_1"),
    folder2: text("folder_2"),
    folder3: text("folder_3"),
    filename: text("filename").notNull(),
    basename: text("basename").notNull(),
    currentSourceRevisionId: text("current_source_revision_id").notNull(),
    integrationNote: text("integration_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("assets_project_path_unique").on(
      table.projectId,
      table.class,
      sql`coalesce(${table.folder1}, '')`,
      sql`coalesce(${table.folder2}, '')`,
      sql`coalesce(${table.folder3}, '')`,
      table.basename,
    ),
    index("assets_project_class_index").on(table.projectId, table.class),
    index("assets_current_source_revision_index").on(table.currentSourceRevisionId),
    check("assets_class_check", sql`${table.class} IN ('image', 'video', 'font')`),
    check(
      "assets_contiguous_folders_check",
      sql`(${table.folder2} IS NULL OR ${table.folder1} IS NOT NULL) AND (${table.folder3} IS NULL OR ${table.folder2} IS NOT NULL)`,
    ),
  ],
)
