import { sql } from "drizzle-orm"
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import type { JsonObject } from "../../../schemas/jsonObjectSchema.js"
export const deletionStateTable = sqliteTable(
  "deletion_states",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    status: text("status", { enum: ["requested", "in_progress", "succeeded", "retryable", "failed"] }).notNull(),
    completedSteps: text("completed_steps", { mode: "json" }).$type<string[]>().notNull(),
    pendingRemoteObjects: text("pending_remote_objects", { mode: "json" }).$type<string[]>().notNull(),
    error: text("error", { mode: "json" }).$type<JsonObject>(),
    requestedAt: text("requested_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("deletion_states_asset_unique").on(table.assetId),
    index("deletion_states_status_index").on(table.status, table.updatedAt),
    check(
      "deletion_states_status_check",
      sql`${table.status} IN ('requested', 'in_progress', 'succeeded', 'retryable', 'failed')`,
    ),
  ],
)
