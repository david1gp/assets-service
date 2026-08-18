import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

export const outboxEventRepositoryMarkDead = (
  db: AssetDatabase,
  input: { id: string; workerId: string; errorMessage: string; deadAt: string },
): Result<OutboxEvent> => {
  try {
    const record = db
      .update(outboxEventTable)
      .set({
        status: "dead",
        attempts: sql`${outboxEventTable.attempts} + 1`,
        availableAt: input.deadAt,
        lastError: input.errorMessage,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
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
      return resultErrorCreate("outboxEventRepositoryMarkDead", "The outbox lease is no longer owned")
    return { success: true, data: record as OutboxEvent }
  } catch (error) {
    return resultErrorCreate("outboxEventRepositoryMarkDead", error instanceof Error ? error.message : String(error))
  }
}
