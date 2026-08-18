import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"

export const sourceRevisionTable = sqliteTable(
  "source_revisions",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    revision: integer("revision").notNull(),
    class: text("class", { enum: ["image", "video", "font"] }).notNull(),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    objectKey: text("object_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("source_revisions_asset_revision_unique").on(table.assetId, table.revision),
    uniqueIndex("source_revisions_object_key_unique").on(table.objectKey),
    index("source_revisions_asset_index").on(table.assetId),
    check("source_revisions_revision_check", sql`${table.revision} > 0`),
    check("source_revisions_class_check", sql`${table.class} IN ('image', 'video', 'font')`),
    check("source_revisions_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
