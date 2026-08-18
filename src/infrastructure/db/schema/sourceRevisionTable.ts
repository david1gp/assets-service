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
    class: text("class", { enum: ["image", "video", "font", "document"] }).notNull(),
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
    check("source_revisions_class_check", sql`${table.class} IN ('image', 'video', 'font', 'document')`),
    check(
      "source_revisions_document_media_type_check",
      sql`${table.class} <> 'document' OR (${table.mediaType} = 'application/pdf' AND lower(${table.originalFilename}) LIKE '%.pdf') OR (${table.mediaType} = 'application/json' AND lower(${table.originalFilename}) LIKE '%.json') OR (${table.mediaType} = 'application/msword' AND lower(${table.originalFilename}) LIKE '%.doc') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND lower(${table.originalFilename}) LIKE '%.docx') OR (${table.mediaType} = 'application/vnd.ms-excel' AND lower(${table.originalFilename}) LIKE '%.xls') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND lower(${table.originalFilename}) LIKE '%.xlsx') OR (${table.mediaType} = 'application/vnd.ms-excel.sheet.macroenabled.12' AND lower(${table.originalFilename}) LIKE '%.xlsm') OR (${table.mediaType} = 'application/vnd.ms-powerpoint' AND lower(${table.originalFilename}) LIKE '%.ppt') OR (${table.mediaType} = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' AND lower(${table.originalFilename}) LIKE '%.pptx') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.text' AND lower(${table.originalFilename}) LIKE '%.odt') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.spreadsheet' AND lower(${table.originalFilename}) LIKE '%.ods') OR (${table.mediaType} = 'application/vnd.oasis.opendocument.presentation' AND lower(${table.originalFilename}) LIKE '%.odp') OR (${table.mediaType} = 'application/rtf' AND lower(${table.originalFilename}) LIKE '%.rtf') OR (${table.mediaType} = 'text/csv' AND lower(${table.originalFilename}) LIKE '%.csv') OR (${table.mediaType} = 'text/plain' AND lower(${table.originalFilename}) LIKE '%.txt')`,
    ),
    check("source_revisions_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
