import { and, eq } from "drizzle-orm"
import * as v from "valibot"

import type { SqliteSnapshotReceipt } from "../backup/sqliteSnapshotReceiptSchema.js"
import { sqliteSnapshotRestoreVerify } from "../backup/sqliteSnapshotRestoreVerify.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { reconciliationRunTable } from "../infrastructure/db/schema/reconciliationRunTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { jobRepositoryRecoverExpiredLeases } from "../workflow/jobRepositoryRecoverExpiredLeases.js"
import { reconciliationOwnershipRead } from "./reconciliationOwnershipRead.js"
import {
  type ReconciliationObject,
  type ReconciliationOwnership,
  reconciliationPlanBuild,
} from "./reconciliationPlanBuild.js"
import type { ReconciliationPlan } from "./reconciliationPlanSchema.js"
import { reconciliationPlanSchema } from "./reconciliationPlanSchema.js"

type ReconciliationServiceCreateInput = {
  db: AssetDatabase
  storage: StorageAdapter
  databasePath?: string
  minimumAgeMs?: number
  clock?: () => Date
}

type ReconciliationPlanInput = {
  objects?: readonly ReconciliationObject[]
  now?: Date | string
}

type ReconciliationApplyResult = {
  planId: string
  dryRun: false
  deletedObjectKeys: readonly string[]
  recoveredRecordIds: readonly string[]
  skippedItems: readonly { itemId: string; reason: string }[]
}

export const reconciliationServiceCreate = (input: ReconciliationServiceCreateInput) => {
  const clock = input.clock ?? (() => new Date())

  const plan = async (planInput: ReconciliationPlanInput = {}): Promise<Result<ReconciliationPlan>> => {
    const now = planInput.now ?? clock()
    const ownership = reconciliationOwnershipRead(input.db, { now, minimumAgeMs: input.minimumAgeMs })
    if (!ownership.success) return ownership
    const objects: Result<readonly ReconciliationObject[]> =
      planInput.objects === undefined
        ? await storageObjectsRead(input.db, input.storage)
        : { success: true, data: planInput.objects as readonly ReconciliationObject[] }
    if (!objects.success) return objects
    return reconciliationPlanBuild({
      objects: objects.data,
      ownership: ownership.data.ownership,
      stalledRecords: ownership.data.stalledRecords,
      now,
      minimumAgeMs: input.minimumAgeMs,
    })
  }

  const apply = async (applyInput: {
    plan: ReconciliationPlan
    backupReceipt: SqliteSnapshotReceipt
    confirm: boolean
    now?: Date | string
  }): Promise<Result<ReconciliationApplyResult>> => {
    const op = "reconciliationServiceApply"
    const parsedPlan = v.safeParse(reconciliationPlanSchema, applyInput.plan)
    if (!parsedPlan.success) return resultErrorCreate(op, "Reconciliation plan is invalid", parsedPlan.issues)
    if (!applyInput.confirm) return resultErrorCreate(op, "Reconciliation apply requires explicit confirmation")
    if (input.databasePath !== undefined && applyInput.backupReceipt.databasePath !== input.databasePath)
      return resultErrorCreate(op, "Backup receipt does not belong to the configured database")
    if (applyInput.backupReceipt.checkResult !== "verified" || applyInput.backupReceipt.integrityCheck !== "ok")
      return resultErrorCreate(op, "A verified SQLite backup receipt is required before cleanup")
    const receipt = await sqliteSnapshotRestoreVerify({
      receipt: applyInput.backupReceipt,
      snapshotPath: applyInput.backupReceipt.snapshotPath,
    })
    if (!receipt.success) return receipt

    const now = applyInput.now ?? clock()
    const nowIso = new Date(now).toISOString()
    const run = reconciliationRunReadOrCreate(input.db, parsedPlan.output.id, nowIso)
    if (!run.success) return run
    if (run.data.status === "succeeded")
      return {
        success: true,
        data: {
          planId: parsedPlan.output.id,
          dryRun: false,
          deletedObjectKeys: run.data.deletedObjectKeys,
          recoveredRecordIds: [],
          skippedItems: run.data.skippedItems,
        },
      }
    const current = reconciliationOwnershipRead(input.db, { now, minimumAgeMs: input.minimumAgeMs })
    if (!current.success) return current
    const recoveredRecordIds: string[] = []
    const expiredJobIds: string[] = []
    const completedItemIds = new Set(run.data.completedItemIds)
    const deletedObjectKeys = [...run.data.deletedObjectKeys]
    const skippedItems = [...run.data.skippedItems]

    const progressPersist = (): Result<null> => {
      const updated = input.db
        .update(reconciliationRunTable)
        .set({
          status: "running",
          completedItemIds: [...completedItemIds],
          deletedObjectKeys,
          skippedItems,
          updatedAt: nowIso,
        })
        .where(eq(reconciliationRunTable.id, run.data.id))
        .returning({ id: reconciliationRunTable.id })
        .get()
      return updated === undefined
        ? resultErrorCreate(op, "Reconciliation progress disappeared")
        : { success: true, data: null }
    }

    const itemSkipped = (itemId: string, reason: string): Result<null> => {
      if (completedItemIds.has(itemId)) return { success: true, data: null }
      completedItemIds.add(itemId)
      skippedItems.push({ itemId, reason })
      return progressPersist()
    }

    for (const item of parsedPlan.output.items) {
      if (completedItemIds.has(item.id)) continue
      if (item.action === "recover") {
        const job = input.db.select({ id: jobTable.id }).from(jobTable).where(eq(jobTable.id, item.objectKey)).get()
        if (job !== undefined) {
          expiredJobIds.push(item.objectKey)
          continue
        }
        const upload = input.db
          .select({ id: uploadTable.id, status: uploadTable.status, updatedAt: uploadTable.updatedAt })
          .from(uploadTable)
          .where(eq(uploadTable.id, item.objectKey))
          .get()
        if (upload?.status === "pending" || upload?.status === "verified") {
          const cutoff = new Date(new Date(now).getTime() - (input.minimumAgeMs ?? 24 * 60 * 60 * 1000)).toISOString()
          if (upload.updatedAt <= cutoff) {
            const updated = input.db
              .update(uploadTable)
              .set({
                status: "cancelled",
                failureReason: "expired_by_reconciliation",
                updatedAt: new Date(now).toISOString(),
              })
              .where(and(eq(uploadTable.id, upload.id), eq(uploadTable.status, upload.status)))
              .returning({ id: uploadTable.id })
              .get()
            if (updated !== undefined) {
              recoveredRecordIds.push(upload.id)
              completedItemIds.add(item.id)
              const persisted = progressPersist()
              if (!persisted.success) return persisted
              continue
            }
          }
        }
        const skipped = itemSkipped(item.id, "stalled_record_changed_before_recovery")
        if (!skipped.success) return skipped
        continue
      }
      if (item.action !== "delete") continue
      if (item.ownershipRecordId === null || !item.ownershipVerified) {
        const skipped = itemSkipped(item.id, "unknown_object_without_verified_owner")
        if (!skipped.success) return skipped
        continue
      }
      const owner = current.data.ownership.find(
        (candidate) =>
          candidate.recordId === item.ownershipRecordId &&
          candidate.bucket === item.bucket &&
          candidate.objectKey === item.objectKey &&
          candidate.verifiedOwnership &&
          candidate.eligibleForDeletion,
      )
      if (owner === undefined) {
        const skipped = itemSkipped(item.id, "ownership_changed_since_dry_run")
        if (!skipped.success) return skipped
        continue
      }
      const location = await storageLocationRead(input.db, item)
      if (!location.success) {
        const skipped = itemSkipped(item.id, location.errorMessage)
        if (!skipped.success) return skipped
        continue
      }
      const verifiedObject = await storageObjectMatchesOwnership(input.storage, location.data, owner)
      if (!verifiedObject.success) return verifiedObject
      if (!verifiedObject.data) {
        const skipped = itemSkipped(item.id, "storage_object_does_not_match_ownership_record")
        if (!skipped.success) return skipped
        continue
      }
      const deleted = await input.storage.deleteObject(location.data)
      if (!deleted.success) return deleted
      deletedObjectKeys.push(item.objectKey)
      completedItemIds.add(item.id)
      const persisted = progressPersist()
      if (!persisted.success) return persisted
      if (item.kind === "staging") {
        input.db
          .update(uploadTable)
          .set({ stagingObjectKey: null, updatedAt: new Date(now).toISOString() })
          .where(and(eq(uploadTable.id, owner.recordId), eq(uploadTable.stagingObjectKey, item.objectKey)))
          .run()
      }
    }

    if (expiredJobIds.length > 0) {
      const recovered = jobRepositoryRecoverExpiredLeases(input.db, { now })
      if (!recovered.success) return recovered
      for (const jobId of expiredJobIds) {
        const job = input.db
          .select({ status: jobTable.status, leaseOwner: jobTable.leaseOwner })
          .from(jobTable)
          .where(eq(jobTable.id, jobId))
          .get()
        if (job?.leaseOwner === null && job.status !== "running") recoveredRecordIds.push(jobId)
      }
    }
    for (const item of parsedPlan.output.items) {
      if (item.action === "recover" && !completedItemIds.has(item.id)) {
        completedItemIds.add(item.id)
        const persisted = progressPersist()
        if (!persisted.success) return persisted
      }
    }
    const completed = input.db
      .update(reconciliationRunTable)
      .set({
        status: "succeeded",
        completedItemIds: [...completedItemIds],
        deletedObjectKeys,
        skippedItems,
        updatedAt: nowIso,
        completedAt: nowIso,
      })
      .where(eq(reconciliationRunTable.id, run.data.id))
      .returning({ id: reconciliationRunTable.id })
      .get()
    if (completed === undefined) return resultErrorCreate(op, "Reconciliation run disappeared before completion")
    return {
      success: true,
      data: { planId: parsedPlan.output.id, dryRun: false, deletedObjectKeys, recoveredRecordIds, skippedItems },
    }
  }

  return { plan, apply }
}

function reconciliationRunReadOrCreate(
  db: AssetDatabase,
  planId: string,
  now: string,
): Result<typeof reconciliationRunTable.$inferSelect> {
  const existing = db.select().from(reconciliationRunTable).where(eq(reconciliationRunTable.planId, planId)).get()
  if (existing !== undefined) return { success: true, data: existing }
  const inserted = databaseRecordInsert(db, reconciliationRunTable, {
    id: `reconciliation-run-${planId}`,
    planId,
    status: "running",
    completedItemIds: [],
    deletedObjectKeys: [],
    skippedItems: [],
    updatedAt: now,
    completedAt: null,
  })
  if (inserted.success) return inserted
  const raced = db.select().from(reconciliationRunTable).where(eq(reconciliationRunTable.planId, planId)).get()
  return raced === undefined ? inserted : { success: true, data: raced }
}

async function storageObjectMatchesOwnership(
  storage: StorageAdapter,
  location: Parameters<NonNullable<StorageAdapter["headObject"]>>[0],
  owner: ReconciliationOwnership,
): Promise<Result<boolean>> {
  const head = await storage.headObject(location)
  if (!head.success) return head
  if (head.data === null) return { success: true, data: false }
  if (owner.expectedByteSize !== undefined && head.data.byteSize !== owner.expectedByteSize)
    return { success: true, data: false }
  if (owner.expectedSha256 === undefined) return { success: true, data: true }
  if (head.data.sha256 === owner.expectedSha256) return { success: true, data: true }
  const read = await storage.readObject(location)
  if (!read.success) return read
  if (read.data === null) return { success: true, data: false }
  const sha256 = new Bun.CryptoHasher("sha256").update(read.data).digest("hex")
  return { success: true, data: sha256 === owner.expectedSha256 && read.data.byteLength === owner.expectedByteSize }
}

async function storageObjectsRead(
  db: AssetDatabase,
  storage: StorageAdapter,
): Promise<Result<readonly ReconciliationObject[]>> {
  const op = "reconciliationStorageObjectsRead"
  if (storage.listObjects === undefined) return resultErrorCreate(op, "Storage adapter cannot list objects safely")
  try {
    const objects = new Map<string, ReconciliationObject>()
    const environments = db.select().from(environmentTable).all()
    for (const environment of environments) {
      const binding = storageBindingResolve(environment, environment.projectId)
      if (!binding.success) return binding
      for (const bucket of new Set([binding.data.bucket])) {
        let continuationToken: string | undefined
        do {
          const page = await storage.listObjects({
            bucket,
            prefix: binding.data.prefix,
            continuationToken,
            maxKeys: 1000,
          })
          if (!page.success) return page
          for (const object of page.data.objects)
            objects.set(`${bucket}\u0000${object.key}`, {
              bucket,
              objectKey: object.key,
              lastModified: object.lastModified,
            })
          continuationToken = page.data.nextContinuationToken ?? undefined
        } while (continuationToken !== undefined)
      }
    }
    return {
      success: true,
      data: [...objects.values()].toSorted((left, right) =>
        `${left.bucket}/${left.objectKey}`.localeCompare(`${right.bucket}/${right.objectKey}`),
      ),
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

async function storageLocationRead(
  db: AssetDatabase,
  item: ReconciliationPlan["items"][number],
): Promise<Result<Parameters<NonNullable<StorageAdapter["deleteObject"]>>[0]>> {
  const op = "reconciliationStorageLocationRead"
  const environments = db.select().from(environmentTable).all()
  const namespace =
    item.kind === "staging" ? "private-staging" : item.kind === "public" ? "public-output" : "private-source"
  for (const environment of environments) {
    const binding = storageBindingResolve(environment, environment.projectId)
    if (!binding.success) continue
    const location = storageObjectLocationCreate(
      binding.data,
      namespace,
      relativeObjectKeyRead(binding.data.prefix, namespace, item.objectKey),
    )
    if (location.success && location.data.bucket === item.bucket && location.data.objectKey === item.objectKey)
      return location
  }
  return resultErrorCreate(op, "No configured environment owns the planned storage location")
}

function relativeObjectKeyRead(
  prefix: string,
  namespace: "private-staging" | "private-source" | "public-output",
  objectKey: string,
): string {
  const root =
    namespace === "private-staging" ? "private/staging" : namespace === "private-source" ? "private/source" : "public"
  return objectKey.startsWith(`${prefix}/${root}/`) ? objectKey.slice(`${prefix}/${root}/`.length) : objectKey
}
