import { and, asc, desc, eq } from "drizzle-orm"
import * as v from "valibot"

import { backupReceiptSchema } from "./backupReceiptSchema.js"
import type { BackupApiRepository } from "./backupApiRepository.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const pageLimitRead = (limit: number | undefined): number => Math.min(100, Math.max(1, limit ?? 50))

export const backupApiRepositoryCreate = (db: AssetDatabase): BackupApiRepository => {
  const receiptRead = (
    record: typeof backupReceiptTable.$inferSelect,
  ): Result<import("./backupReceiptSchema.js").BackupReceipt> => {
    const parsed = v.safeParse(backupReceiptSchema, record)
    if (!parsed.success)
      return resultErrorCreate("backupApiRepositoryReceiptRead", "The stored backup receipt was invalid")
    return { success: true, data: parsed.output }
  }

  const backupReceiptsRead: BackupApiRepository["backupReceiptsRead"] = (projectId, options) => {
    try {
      const records = db
        .select({ receipt: backupReceiptTable })
        .from(backupReceiptTable)
        .leftJoin(sourceRevisionTable, eq(sourceRevisionTable.id, backupReceiptTable.sourceRevisionId))
        .leftJoin(assetTable, eq(assetTable.id, sourceRevisionTable.assetId))
        .where(
          and(
            eq(backupReceiptTable.projectId, projectId),
            ...(options.sourceRevisionId === undefined
              ? []
              : [eq(backupReceiptTable.sourceRevisionId, options.sourceRevisionId)]),
            ...(options.assetId === undefined ? [] : [eq(assetTable.id, options.assetId)]),
            ...(options.checkResult === undefined ? [] : [eq(backupReceiptTable.checkResult, options.checkResult)]),
          ),
        )
        .orderBy(desc(backupReceiptTable.completedAt), asc(backupReceiptTable.id))
        .all()
      const offset = options.cursor ?? 0
      const limit = pageLimitRead(options.limit)
      const selected = records.slice(offset, offset + limit + 1)
      const items: import("./backupReceiptSchema.js").BackupReceipt[] = []
      for (const record of selected.slice(0, limit)) {
        const receipt = receiptRead(record.receipt)
        if (!receipt.success) return receipt
        items.push(receipt.data)
      }
      return { success: true, data: { items, nextCursor: selected.length > limit ? offset + limit : null } }
    } catch (error) {
      return resultErrorCreate("backupApiRepositoryReceiptsRead", "The backup receipts could not be read", error)
    }
  }

  const backupReceiptRead: BackupApiRepository["backupReceiptRead"] = (projectId, receiptId) => {
    try {
      const record = db
        .select()
        .from(backupReceiptTable)
        .where(and(eq(backupReceiptTable.projectId, projectId), eq(backupReceiptTable.id, receiptId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      return receiptRead(record)
    } catch (error) {
      return resultErrorCreate("backupApiRepositoryReceiptRead", "The backup receipt could not be read", error)
    }
  }

  const backupStatusRead: BackupApiRepository["backupStatusRead"] = (projectId, sourceRevisionId) => {
    try {
      const source = db
        .select({ id: sourceRevisionTable.id })
        .from(sourceRevisionTable)
        .innerJoin(assetTable, eq(assetTable.id, sourceRevisionTable.assetId))
        .where(and(eq(sourceRevisionTable.id, sourceRevisionId), eq(assetTable.projectId, projectId)))
        .get()
      if (source === undefined) return { success: true, data: null }
      const records = db
        .select()
        .from(backupReceiptTable)
        .where(
          and(eq(backupReceiptTable.projectId, projectId), eq(backupReceiptTable.sourceRevisionId, sourceRevisionId)),
        )
        .orderBy(desc(backupReceiptTable.completedAt), asc(backupReceiptTable.id))
        .all()
      const latest = records[0]
      if (latest === undefined) return { success: true, data: { sourceRevisionId, status: "pending", receipt: null } }
      const receipt = receiptRead(latest)
      if (!receipt.success) return receipt
      return {
        success: true,
        data: { sourceRevisionId, status: receipt.data.checkResult, receipt: receipt.data },
      }
    } catch (error) {
      return resultErrorCreate("backupApiRepositoryStatusRead", "The backup status could not be read", error)
    }
  }

  const backupAssetStatusRead: NonNullable<BackupApiRepository["backupAssetStatusRead"]> = (projectId, assetId) => {
    const asset = db
      .select({ currentSourceRevisionId: assetTable.currentSourceRevisionId })
      .from(assetTable)
      .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
      .get()
    if (asset === undefined) return { success: true, data: null }
    return backupStatusRead(projectId, asset.currentSourceRevisionId)
  }

  return { backupReceiptsRead, backupReceiptRead, backupStatusRead, backupAssetStatusRead }
}
