import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"

import type { MediaMetadata } from "../../../metadata/mediaMetadataSchema.js"
import { assetTable } from "./assetTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"

export const assetMetadataTable = sqliteTable(
  "asset_metadata",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sourceRevisionId: text("source_revision_id")
      .notNull()
      .references(() => sourceRevisionTable.id, { onDelete: "restrict", onUpdate: "cascade" }),
    metadata: text("metadata", { mode: "json" }).$type<MediaMetadata>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("asset_metadata_asset_unique").on(table.assetId),
    index("asset_metadata_source_revision_index").on(table.sourceRevisionId),
  ],
)
