import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const organizationTable = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_unique").on(table.slug)],
)
