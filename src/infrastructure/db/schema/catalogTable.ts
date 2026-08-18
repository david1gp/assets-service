import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { catalogGenerationTable } from "./catalogGenerationTable.js"
import { projectTable } from "./projectTable.js"

export const catalogTable = sqliteTable(
  "catalogs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    environment: text("environment", { enum: ["development", "production"] }).notNull(),
    generationId: text("generation_id")
      .notNull()
      .references(() => catalogGenerationTable.id, { onDelete: "restrict", onUpdate: "cascade" }),
    schema: text("schema").notNull(),
    digest: text("digest").notNull(),
    rendererVersion: text("renderer_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("catalogs_project_environment_unique").on(table.projectId, table.environment),
    uniqueIndex("catalogs_generation_unique").on(table.generationId),
    index("catalogs_project_index").on(table.projectId),
    check("catalogs_environment_check", sql`${table.environment} IN ('development', 'production')`),
  ],
)
