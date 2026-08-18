import { asc, eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { outputVersionTable } from "../infrastructure/db/schema/outputVersionTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { outputVersionDecisionCreate } from "./outputVersionDecisionCreate.js"

type OutputVersionAllocationInput = Omit<
  typeof outputVersionTable.$inferInsert,
  "version" | "objectKey" | "current" | "sourceRevisionId"
> & {
  sourceRevisionId: string
  objectKeyCreate: (version: number) => string
  current?: boolean
  forceNewVersion?: boolean
}

type OutputVersionAllocation = {
  outcome: "reused" | "allocated"
  record: typeof outputVersionTable.$inferSelect
}

export const outputVersionRepositoryAllocate = (
  db: AssetDatabase,
  input: OutputVersionAllocationInput,
): Result<OutputVersionAllocation> =>
  databaseTransactionRun<OutputVersionAllocation>(db, (transaction) => {
    const op = "outputVersionRepositoryAllocate"
    const existingVersions = transaction
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.outputDefinitionId, input.outputDefinitionId))
      .orderBy(asc(outputVersionTable.version))
      .all()
    const existingById = transaction.select().from(outputVersionTable).where(eq(outputVersionTable.id, input.id)).get()
    if (existingById !== undefined) {
      if (
        existingById.outputDefinitionId !== input.outputDefinitionId ||
        existingById.sha256 !== input.sha256 ||
        existingById.sourceRevisionId !== input.sourceRevisionId
      )
        return resultErrorCreate(op, "The output version idempotency record did not match")
      return { success: true, data: { outcome: "reused", record: existingById } }
    }
    const decision = outputVersionDecisionCreate(
      existingVersions,
      input.byteSize,
      input.sha256,
      input.forceNewVersion ?? false,
      input.sourceRevisionId,
    )

    if (decision.kind === "collision") {
      return resultErrorCreate(op, `Checksum and byte size disagree for version ${decision.version}`)
    }

    if (decision.kind === "reuse") {
      const existing = existingVersions.find((version) => version.version === decision.version)
      if (existing === undefined) return resultErrorCreate(op, "The reusable output version was not found")

      if (input.current !== false) {
        transaction
          .update(outputVersionTable)
          .set({ current: false })
          .where(eq(outputVersionTable.outputDefinitionId, input.outputDefinitionId))
          .run()
        transaction
          .update(outputVersionTable)
          .set({ current: true })
          .where(eq(outputVersionTable.id, existing.id))
          .run()
      }

      return {
        success: true,
        data: {
          outcome: "reused",
          record: { ...existing, current: input.current === false ? existing.current : true },
        },
      }
    }

    const objectKey = input.objectKeyCreate(decision.version)
    const objectKeyOwner = transaction
      .select({ id: outputVersionTable.id })
      .from(outputVersionTable)
      .where(eq(outputVersionTable.objectKey, objectKey))
      .get()
    if (objectKeyOwner !== undefined) return resultErrorCreate(op, `Immutable object key already exists: ${objectKey}`)

    transaction
      .update(outputVersionTable)
      .set({ current: false })
      .where(eq(outputVersionTable.outputDefinitionId, input.outputDefinitionId))
      .run()

    const inserted = databaseRecordInsert(transaction, outputVersionTable, {
      ...input,
      version: decision.version,
      objectKey,
      current: input.current ?? true,
    })
    if (!inserted.success) return inserted

    return { success: true, data: { outcome: "allocated", record: inserted.data } }
  })
