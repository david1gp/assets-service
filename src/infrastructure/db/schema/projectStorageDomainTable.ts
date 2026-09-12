import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"

export const projectStorageDomainTable = sqliteTable(
  "project_storage_domains",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    bucket: text("bucket").notNull(),
    customDomain: text("custom_domain").notNull(),
    zoneId: text("zone_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("project_storage_domains_project_bucket_custom_domain_unique").on(
      table.projectId,
      table.bucket,
      table.customDomain,
    ),
    index("project_storage_domains_project_index").on(table.projectId),
    index("project_storage_domains_bucket_index").on(table.bucket),
  ],
)
