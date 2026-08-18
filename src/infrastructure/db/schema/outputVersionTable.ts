import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { outputDefinitionTable } from "./outputDefinitionTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"

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
    sourceRevisionId: text("source_revision_id").references(() => sourceRevisionTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
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
    index("output_versions_source_revision_index").on(table.sourceRevisionId),
    check("output_versions_version_check", sql`${table.version} > 0`),
    check("output_versions_byte_size_check", sql`${table.byteSize} >= 0`),
    check(
      "output_versions_dimensions_check",
      sql`(${table.width} IS NULL AND ${table.height} IS NULL) OR (${table.width} > 0 AND ${table.height} > 0)`,
    ),
    check(
      "output_versions_document_media_type_check",
      sql`${table.mediaType} NOT IN ('application/pdf', 'application/json', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroenabled.12', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation', 'application/rtf', 'text/csv', 'text/plain') OR (${table.mediaType} = 'application/pdf' AND ${table.extension} = 'pdf') OR (${table.mediaType} = 'application/json' AND ${table.extension} = 'json') OR (${table.mediaType} = 'application/msword' AND ${table.extension} = 'doc') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND ${table.extension} = 'docx') OR (${table.mediaType} = 'application/vnd.ms-excel' AND ${table.extension} = 'xls') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND ${table.extension} = 'xlsx') OR (${table.mediaType} = 'application/vnd.ms-excel.sheet.macroenabled.12' AND ${table.extension} = 'xlsm') OR (${table.mediaType} = 'application/vnd.ms-powerpoint' AND ${table.extension} = 'ppt') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND ${table.extension} = 'pptx') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.text' AND ${table.extension} = 'odt') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.spreadsheet' AND ${table.extension} = 'ods') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.presentation' AND ${table.extension} = 'odp') OR (${table.mediaType} = 'application/rtf' AND ${table.extension} = 'rtf') OR (${table.mediaType} = 'text/csv' AND ${table.extension} = 'csv') OR (${table.mediaType} = 'text/plain' AND ${table.extension} = 'txt')`,
    ),
  ],
)
