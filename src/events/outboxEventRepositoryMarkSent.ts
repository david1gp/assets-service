import { and, eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

export const outboxEventRepositoryMarkSent = (
  db: AssetDatabase,
  input: { id: string; workerId: string; sentAt: string },
): Result<OutboxEvent> => {
  try {
    const record = db
      .update(outboxEventTable)
      .set({ status: "sent", deliveredAt: input.sentAt, lastError: null, leaseOwner: null, leaseExpiresAt: null })
      .where(
        and(
          eq(outboxEventTable.id, input.id),
          eq(outboxEventTable.status, "processing"),
          eq(outboxEventTable.leaseOwner, input.workerId),
        ),
      )
      .returning()
      .get()
    if (record === undefined)
      return resultErrorCreate("outboxEventRepositoryMarkSent", "The outbox lease is no longer owned")
    return { success: true, data: record as OutboxEvent }
  } catch (error) {
    return resultErrorCreate("outboxEventRepositoryMarkSent", error instanceof Error ? error.message : String(error))
  }
}
