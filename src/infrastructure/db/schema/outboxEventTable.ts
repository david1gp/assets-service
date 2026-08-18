import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"

import type { JsonObject } from "../../../schemas/jsonObjectSchema.js"

export const outboxEventTable = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    kind: text("kind", { enum: ["customer_asset_uploaded", "audit_event"] }).notNull(),
    payload: text("payload", { mode: "json" }).$type<JsonObject>().notNull(),
    status: text("status", { enum: ["pending", "processing", "sent", "dead", "delivered", "failed"] }).notNull(),
    attempts: integer("attempts").notNull(),
    availableAt: text("available_at").notNull(),
    deliveredAt: text("delivered_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: text("lease_expires_at"),
  },
  (table) => [
    uniqueIndex("outbox_events_event_id_unique").on(table.eventId),
    index("outbox_events_delivery_index").on(table.status, table.availableAt),
    check("outbox_events_kind_check", sql`${table.kind} IN ('customer_asset_uploaded', 'audit_event')`),
    check(
      "outbox_events_status_check",
      sql`${table.status} IN ('pending', 'processing', 'sent', 'dead', 'delivered', 'failed')`,
    ),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
)
