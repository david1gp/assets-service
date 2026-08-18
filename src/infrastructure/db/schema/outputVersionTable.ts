import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { outputDefinitionTable } from "./outputDefinitionTable.js"

export const outputVersionTable = sqliteTable(
  "output_versions",
  {
    id: text("id").primaryKey(),
    outputDefinitionId: text("output_definition_id")
      .notNull()
      .references(() => outputDefinitionTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version: integer("version").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    mediaType: text("media_type").notNull(),
    extension: text("extension").notNull(),
    objectKey: text("object_key").notNull(),
    toolchainVersion: text("toolchain_version").notNull(),
    width: integer("width"),
    height: integer("height"),
    current: integer("current", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("output_versions_definition_version_unique").on(table.outputDefinitionId, table.version),
    uniqueIndex("output_versions_current_unique").on(table.outputDefinitionId).where(sql`${table.current} = 1`),
    uniqueIndex("output_versions_object_key_unique").on(table.objectKey),
    index("output_versions_asset_index").on(table.assetId),
    check("output_versions_version_check", sql`${table.version} > 0`),
    check("output_versions_byte_size_check", sql`${table.byteSize} >= 0`),
    check(
      "output_versions_dimensions_check",
      sql`(${table.width} IS NULL AND ${table.height} IS NULL) OR (${table.width} > 0 AND ${table.height} > 0)`,
    ),
  ],
)
