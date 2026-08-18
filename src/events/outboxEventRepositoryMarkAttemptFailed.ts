import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

export const outboxEventRepositoryMarkAttemptFailed = (
  db: AssetDatabase,
  input: { id: string; workerId: string; errorMessage: string; availableAt: string; maxAttempts: number },
): Result<OutboxEvent> => {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1)
    return resultErrorCreate("outboxEventRepositoryMarkAttemptFailed", "Maximum attempts is invalid")
  try {
    const record = db
      .update(outboxEventTable)
      .set({
        status: sql`CASE WHEN ${outboxEventTable.attempts} + 1 >= ${input.maxAttempts} THEN 'dead' ELSE 'failed' END`,
        attempts: sql`${outboxEventTable.attempts} + 1`,
        availableAt: input.availableAt,
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
      return resultErrorCreate("outboxEventRepositoryMarkAttemptFailed", "The outbox lease is no longer owned")
    return { success: true, data: record as OutboxEvent }
  } catch (error) {
    return resultErrorCreate(
      "outboxEventRepositoryMarkAttemptFailed",
      error instanceof Error ? error.message : String(error),
    )
  }
}
