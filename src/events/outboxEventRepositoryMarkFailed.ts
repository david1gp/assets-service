import { eq, sql } from "drizzle-orm"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

export const outboxEventRepositoryMarkFailed = (
  db: AssetDatabase,
  id: string,
  errorMessage: string,
  availableAt: string,
): Result<OutboxEvent> => {
  const op = "outboxEventRepositoryMarkFailed"

  try {
    const record = db
      .update(outboxEventTable)
      .set({
        status: "failed",
        attempts: sql`${outboxEventTable.attempts} + 1`,
        availableAt,
        lastError: errorMessage,
      })
      .where(eq(outboxEventTable.id, id))
      .returning()
      .get()

    if (record === undefined) return resultErrorCreate(op, `Outbox event not found: ${id}`)
    return { success: true, data: record as OutboxEvent }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
