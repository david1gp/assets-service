import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { environmentTable } from "./environmentTable.js"
import { projectTable } from "./projectTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"

export const uploadTable = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environmentTable.id, { onDelete: "restrict", onUpdate: "cascade" }),
    assetId: text("asset_id").references(() => assetTable.id, { onDelete: "set null", onUpdate: "cascade" }),
    sourceRevisionId: text("source_revision_id").references(() => sourceRevisionTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    uploaderId: text("uploader_id"),
    notificationEligible: integer("notification_eligible", { mode: "boolean" }).notNull().default(true),
    originalFilename: text("original_filename").notNull(),
    folder1: text("folder_1"),
    folder2: text("folder_2"),
    folder3: text("folder_3"),
    integrationNote: text("integration_note").notNull(),
    stagingObjectKey: text("staging_object_key"),
    byteSize: integer("byte_size").notNull(),
    mediaType: text("media_type"),
    sha256: text("sha256"),
    status: text("status", { enum: ["pending", "verified", "accepted", "failed", "cancelled"] }).notNull(),
    failureReason: text("failure_reason"),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("uploads_project_status_index").on(table.projectId, table.status),
    index("uploads_asset_index").on(table.assetId),
    index("uploads_source_revision_index").on(table.sourceRevisionId),
    check(
      "uploads_contiguous_folders_check",
      sql`(${table.folder2} IS NULL OR ${table.folder1} IS NOT NULL) AND (${table.folder3} IS NULL OR ${table.folder2} IS NOT NULL)`,
    ),
    check("uploads_status_check", sql`${table.status} IN ('pending', 'verified', 'accepted', 'failed', 'cancelled')`),
    check("uploads_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
