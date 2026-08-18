import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import { projectTable } from "./projectTable.js"
import { organizationTable } from "./organizationTable.js"

export const projectGrantTable = sqliteTable(
  "project_grants",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: text("subject_id").notNull(),
    role: text("role", { enum: ["assets.uploader", "assets.admin"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("project_grants_subject_role_unique").on(table.projectId, table.subjectId, table.role),
    index("project_grants_organization_index").on(table.organizationId),
    index("project_grants_subject_index").on(table.subjectId),
    check("project_grants_role_check", sql`${table.role} IN ('assets.uploader', 'assets.admin')`),
  ],
)
