import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"

export const outputDefinitionTable = sqliteTable(
  "output_definitions",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: text("kind", { enum: ["image", "video", "font", "document"] }).notNull(),
    key: text("key").notNull(),
    width: integer("width"),
    height: integer("height"),
    format: text("format"),
    quality: integer("quality"),
    showAiLabel: integer("show_ai_label", { mode: "boolean" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("output_definitions_asset_key_unique").on(table.assetId, table.key),
    index("output_definitions_asset_index").on(table.assetId),
    check("output_definitions_kind_check", sql`${table.kind} IN ('image', 'video', 'font', 'document')`),
    check(
      "output_definitions_dimensions_check",
      sql`(${table.kind} = 'image' AND ${table.width} > 0 AND ${table.height} > 0 AND ${table.format} IN ('jpg', 'png', 'webp', 'avif') AND (${table.quality} IS NULL OR (${table.quality} BETWEEN 1 AND 100))) OR (${table.kind} = 'video' AND ${table.width} IS NULL AND ${table.height} IS NULL AND ${table.format} IS NULL AND ${table.quality} IS NULL) OR (${table.kind} = 'font' AND ${table.width} IS NULL AND ${table.height} IS NULL AND ${table.format} IS NOT NULL AND ${table.quality} IS NULL) OR (${table.kind} = 'document' AND ${table.key} = 'default' AND ${table.width} IS NULL AND ${table.height} IS NULL AND ${table.format} IS NULL AND ${table.quality} IS NULL AND ${table.showAiLabel} IS NULL)`,
    ),
  ],
)
