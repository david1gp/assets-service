import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { catalogGenerationTable } from "./catalogGenerationTable.js"
import { projectTable } from "./projectTable.js"

export const manifestTable = sqliteTable(
  "manifests",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id").references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    catalogGenerationId: text("catalog_generation_id").references(() => catalogGenerationTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    kind: text("kind", { enum: ["asset", "catalog", "deletion"] }).notNull(),
    schema: text("schema").notNull(),
    objectKey: text("object_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("manifests_object_key_unique").on(table.objectKey),
    uniqueIndex("manifests_sha256_unique").on(table.sha256),
    index("manifests_project_index").on(table.projectId),
    index("manifests_asset_index").on(table.assetId),
    index("manifests_catalog_generation_index").on(table.catalogGenerationId),
    check("manifests_kind_check", sql`${table.kind} IN ('asset', 'catalog', 'deletion')`),
    check("manifests_byte_size_check", sql`${table.byteSize} >= 0`),
  ],
)
