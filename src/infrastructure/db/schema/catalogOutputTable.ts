import { sql } from "drizzle-orm"
import { sqliteTable, text, primaryKey, index, check } from "drizzle-orm/sqlite-core"

import type { MediaMetadata } from "../../../metadata/mediaMetadataSchema.js"
import { assetTable } from "./assetTable.js"
import { catalogGenerationTable } from "./catalogGenerationTable.js"
import { outputVersionTable } from "./outputVersionTable.js"

export const catalogOutputTable = sqliteTable(
  "catalog_outputs",
  {
    generationId: text("generation_id")
      .notNull()
      .references(() => catalogGenerationTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    outputVersionId: text("output_version_id")
      .notNull()
      .references(() => outputVersionTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    class: text("class", { enum: ["image", "video", "font"] }).notNull(),
    key: text("key").notNull(),
    property: text("property").notNull(),
    path: text("path").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<MediaMetadata>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationId, table.outputVersionId], name: "catalog_outputs_generation_version_pk" }),
    index("catalog_outputs_generation_index").on(table.generationId),
    index("catalog_outputs_asset_index").on(table.assetId),
    check("catalog_outputs_class_check", sql`${table.class} IN ('image', 'video', 'font')`),
  ],
)
