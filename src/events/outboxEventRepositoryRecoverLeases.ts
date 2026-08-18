import { and, eq, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type OutboxEventRepositoryRecoverLeasesInput = { now?: Date | string }

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const outboxEventRepositoryRecoverLeases = (
  db: AssetDatabase,
  input: OutboxEventRepositoryRecoverLeasesInput = {},
): Result<number> => {
  const now = isoDateCreate(input.now)
  return databaseTransactionRun<number>(
    db,
    (transaction) => {
      try {
        const recovered = transaction
          .update(outboxEventTable)
          .set({
            status: "pending",
            availableAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: "Delivery lease expired",
          })
          .where(
            and(
              eq(outboxEventTable.status, "processing"),
              sql`${outboxEventTable.leaseExpiresAt} IS NOT NULL AND ${outboxEventTable.leaseExpiresAt} <= ${now}`,
            ),
          )
          .returning({ id: outboxEventTable.id })
          .all()
        return { success: true, data: recovered.length }
      } catch (error) {
        return resultErrorCreate(
          "outboxEventRepositoryRecoverLeases",
          error instanceof Error ? error.message : String(error),
        )
      }
    },
    { behavior: "immediate" },
  )
}
