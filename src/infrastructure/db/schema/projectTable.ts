import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, check, index } from "drizzle-orm/sqlite-core"

import { organizationTable } from "./organizationTable.js"

export const projectTable = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    defaultEnvironment: text("default_environment", { enum: ["development", "production"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_organization_slug_unique").on(table.organizationId, table.slug),
    index("projects_organization_index").on(table.organizationId),
    check("projects_default_environment_check", sql`${table.defaultEnvironment} IN ('development', 'production')`),
  ],
)
