import { and, asc, eq, inArray, sql } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { outboxEventTable } from "../infrastructure/db/schema/outboxEventTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { OutboxEvent } from "./outboxEventSchema.js"

type OutboxEventRepositoryClaimDueInput = {
  workerId: string
  now?: Date | string
  leaseMs?: number
  kinds?: readonly ("customer_asset_uploaded" | "audit_event")[]
}

const isoDateCreate = (value: Date | string | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? new Date().toISOString())

export const outboxEventRepositoryClaimDue = (
  db: AssetDatabase,
  input: OutboxEventRepositoryClaimDueInput,
): Result<OutboxEvent | null> => {
  const now = isoDateCreate(input.now)
  const leaseMs = input.leaseMs ?? 60_000
  if (input.workerId.length === 0) return resultErrorCreate("outboxEventRepositoryClaimDue", "Worker ID is required")
  if (!Number.isInteger(leaseMs) || leaseMs <= 0)
    return resultErrorCreate("outboxEventRepositoryClaimDue", "Lease duration is invalid")
  if (input.kinds?.length === 0) return { success: true, data: null }
  const leaseExpiresAt = new Date(new Date(now).getTime() + leaseMs).toISOString()
  return databaseTransactionRun<OutboxEvent | null>(
    db,
    (transaction) => {
      const candidate = transaction
        .select()
        .from(outboxEventTable)
        .where(
          and(
            inArray(outboxEventTable.status, ["pending", "failed"]),
            sql`${outboxEventTable.availableAt} <= ${now}`,
            input.kinds === undefined ? undefined : inArray(outboxEventTable.kind, input.kinds),
          ),
        )
        .orderBy(asc(outboxEventTable.availableAt), asc(outboxEventTable.createdAt), asc(outboxEventTable.id))
        .limit(1)
        .get()
      if (candidate === undefined) return { success: true, data: null }
      const claimed = transaction
        .update(outboxEventTable)
        .set({ status: "processing", leaseOwner: input.workerId, leaseExpiresAt, lastError: null })
        .where(
          and(
            eq(outboxEventTable.id, candidate.id),
            inArray(outboxEventTable.status, ["pending", "failed"]),
            sql`${outboxEventTable.availableAt} <= ${now}`,
          ),
        )
        .returning()
        .get()
      if (claimed === undefined)
        return resultErrorCreate("outboxEventRepositoryClaimDue", "Outbox event changed concurrently")
      return { success: true, data: claimed as OutboxEvent }
    },
    { behavior: "immediate" },
  )
}
