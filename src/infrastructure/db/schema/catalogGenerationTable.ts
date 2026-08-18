import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const catalogGenerationTable = sqliteTable(
  "catalog_generations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environment: text("environment", { enum: ["development", "production"] }).notNull(),
    digest: text("digest").notNull(),
    manifestObjectKey: text("manifest_object_key").notNull(),
    rendererVersion: text("renderer_version").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("catalog_generations_project_environment_digest_unique").on(
      table.projectId,
      table.environment,
      table.digest,
    ),
    index("catalog_generations_project_environment_index").on(table.projectId, table.environment, table.createdAt),
    check("catalog_generations_environment_check", sql`${table.environment} IN ('development', 'production')`),
  ],
)
