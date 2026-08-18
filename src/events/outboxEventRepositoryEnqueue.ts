import { eq } from "drizzle-orm"

import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

export const outboxEventRepositoryEnqueue = (db: AssetDatabase, event: OutboxEvent) => {
  const existing = db.select().from(outboxEventTable).where(eq(outboxEventTable.eventId, event.eventId)).get()
  if (existing !== undefined) {
    if (
      existing.kind !== event.kind ||
      canonicalJsonStringify(existing.payload) !== canonicalJsonStringify(event.payload)
    )
      return {
        success: false as const,
        op: "outboxEventRepositoryEnqueue",
        errorMessage: "The outbox event id is already used by a different event",
      }
    return { success: true as const, data: existing }
  }
  const inserted = databaseRecordInsert(db, outboxEventTable, {
    ...event,
    deliveredAt: event.deliveredAt,
    lastError: event.lastError,
  })
  if (inserted.success) return inserted
  const raced = db.select().from(outboxEventTable).where(eq(outboxEventTable.eventId, event.eventId)).get()
  if (raced === undefined) return inserted
  if (raced.kind !== event.kind || canonicalJsonStringify(raced.payload) !== canonicalJsonStringify(event.payload))
    return {
      success: false as const,
      op: "outboxEventRepositoryEnqueue",
      errorMessage: "The outbox event id is already used by a different event",
    }
  return { success: true as const, data: raced }
}
