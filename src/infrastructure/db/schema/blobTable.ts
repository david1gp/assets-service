import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { outputVersionTable } from "./outputVersionTable.js"
import { projectTable } from "./projectTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"

export const blobTable = sqliteTable(
  "blobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id").references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sourceRevisionId: text("source_revision_id").references(() => sourceRevisionTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    outputVersionId: text("output_version_id").references(() => outputVersionTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    storage: text("storage", { enum: ["private", "public"] }).notNull(),
    environment: text("environment", { enum: ["development", "production"] }),
    kind: text("kind", { enum: ["staging", "source", "output", "manifest"] }).notNull(),
    objectKey: text("object_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    mediaType: text("media_type"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("blobs_storage_object_key_unique").on(table.storage, table.objectKey),
    index("blobs_project_index").on(table.projectId),
    index("blobs_asset_index").on(table.assetId),
    index("blobs_source_revision_index").on(table.sourceRevisionId),
    index("blobs_output_version_index").on(table.outputVersionId),
    check("blobs_storage_check", sql`${table.storage} IN ('private', 'public')`),
    check("blobs_kind_check", sql`${table.kind} IN ('staging', 'source', 'output', 'manifest')`),
    check("blobs_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
