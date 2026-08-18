import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"

import { organizationTable } from "./organizationTable.js"
import { projectTable } from "./projectTable.js"

export const projectBindingTable = sqliteTable(
  "project_bindings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    zitadelProjectId: text("zitadel_project_id").notNull(),
    serviceProjectId: text("service_project_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("project_bindings_project_unique").on(table.projectId),
    uniqueIndex("project_bindings_zitadel_project_unique").on(table.zitadelProjectId),
    uniqueIndex("project_bindings_service_project_unique").on(table.serviceProjectId),
    index("project_bindings_organization_index").on(table.organizationId),
  ],
)
