import { sql } from "drizzle-orm"
import { sqliteTable, text, index, check } from "drizzle-orm/sqlite-core"

import type { JsonObject } from "../../../schemas/jsonObjectSchema.js"
import { organizationTable } from "./organizationTable.js"
import { projectTable } from "./projectTable.js"

export const auditEventTable = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    projectId: text("project_id").references(() => projectTable.id, { onDelete: "set null", onUpdate: "cascade" }),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    details: text("details", { mode: "json" }).$type<JsonObject>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_events_organization_created_index").on(table.organizationId, table.createdAt),
    index("audit_events_project_created_index").on(table.projectId, table.createdAt),
    index("audit_events_resource_index").on(table.resourceType, table.resourceId),
    check("audit_events_action_length_check", sql`length(${table.action}) BETWEEN 1 AND 128`),
    check("audit_events_resource_type_length_check", sql`length(${table.resourceType}) BETWEEN 1 AND 128`),
  ],
)
