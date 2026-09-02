import { and, eq, inArray } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { environmentTable } from "../infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { uploadTable } from "../infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../infrastructure/db/schema/workflowTable.js"
import type { Environment } from "../project/environmentSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { storageStagingObjectKeyCreate } from "../storage/storageStagingObjectKeyCreate.js"
import { storageMigrationBindingSnapshotSchema } from "./storageMigrationBindingSnapshotSchema.js"
import { storageMigrationCreateInputSchema } from "./storageMigrationCreateInputSchema.js"
import type { StorageMigrationOwnership } from "./storageMigrationOwnership.js"
import { type StorageMigrationProgress, storageMigrationProgressSchema } from "./storageMigrationProgressSchema.js"
import type { StorageMigrationRepository } from "./storageMigrationRepository.js"
import { type StorageMigration, storageMigrationSchema } from "./storageMigrationSchema.js"
import { type StorageMigrationStatus, storageMigrationStatusSchema } from "./storageMigrationStatusSchema.js"
import { storageMigrationTable } from "./storageMigrationTable.js"

type StorageMigrationRepositoryCreateOptions = {
  clock?: () => Date
}

const activeStatuses = ["queued", "running"] as const
const terminalStatuses = new Set<StorageMigrationStatus>(["succeeded", "failed", "cancelled"])
const statusTransitions: Record<StorageMigrationStatus, readonly StorageMigrationStatus[]> = {
  queued: ["queued", "running", "failed", "cancelled"],
  running: ["running", "succeeded", "failed", "cancelled"],
  succeeded: ["succeeded"],
  failed: ["failed"],
  cancelled: ["cancelled"],
}

export const storageMigrationRepositoryCreate = (
  db: AssetDatabase,
  options: StorageMigrationRepositoryCreateOptions = {},
): StorageMigrationRepository => {
  const clock = options.clock ?? (() => new Date())

  const storageMigrationRecordRead = (
    record: typeof storageMigrationTable.$inferSelect,
    op: string,
  ): Result<StorageMigration> => {
    const parsed = v.safeParse(storageMigrationSchema, record)
    if (!parsed.success) return resultErrorCreate(op, "The stored storage migration was invalid", parsed.issues)
    return { success: true, data: parsed.output }
  }

  const storageMigrationCreate: StorageMigrationRepository["storageMigrationCreate"] = (input, transactionInput) => {
    const op = "storageMigrationCreate"
    const parsed = v.safeParse(storageMigrationCreateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
    let now: string
    try {
      now = new Date(clock()).toISOString()
    } catch (error) {
      return resultErrorCreate(op, "The storage migration timestamp could not be created", error)
    }

    const create = (transaction: AssetDatabase): Result<StorageMigration> => {
      const existing = transaction
        .select()
        .from(storageMigrationTable)
        .where(
          and(
            eq(storageMigrationTable.environmentId, parsed.output.environmentId),
            eq(storageMigrationTable.idempotencyKey, parsed.output.idempotencyKey),
          ),
        )
        .get()
      if (existing !== undefined) {
        const migration = storageMigrationRecordRead(existing, op)
        if (!migration.success) return migration
        if (!storageMigrationIdentityMatches(migration.data, parsed.output))
          return resultErrorCreate(op, "Idempotency key already belongs to a different storage migration")
        return migration
      }

      const environment = transaction
        .select()
        .from(environmentTable)
        .where(
          and(
            eq(environmentTable.id, parsed.output.environmentId),
            eq(environmentTable.projectId, parsed.output.projectId),
          ),
        )
        .get()
      if (environment === undefined) return resultErrorCreate(op, "The migration environment does not exist")
      if (!storageMigrationSourceMatchesEnvironment(parsed.output.sourceBinding, environment))
        return resultErrorCreate(op, "The migration source binding does not match the current environment binding")

      // Deletion workflows remove an asset's objects from every environment in its project.
      const activeDeletion = transaction
        .select({ id: workflowTable.id })
        .from(workflowTable)
        .where(
          and(
            eq(workflowTable.projectId, parsed.output.projectId),
            eq(workflowTable.kind, "deletion"),
            inArray(workflowTable.status, ["queued", "running"]),
          ),
        )
        .get()
      if (activeDeletion !== undefined)
        return resultErrorCreate(
          op,
          `An active deletion workflow already exists for project ${parsed.output.projectId}`,
          {
            code: "deletion_workflow_active",
            environmentId: parsed.output.environmentId,
            projectId: parsed.output.projectId,
            workflowId: activeDeletion.id,
          },
          { retryable: true },
        )

      const active = transaction
        .select({ id: storageMigrationTable.id })
        .from(storageMigrationTable)
        .where(
          and(
            eq(storageMigrationTable.environmentId, parsed.output.environmentId),
            inArray(storageMigrationTable.status, [...activeStatuses]),
          ),
        )
        .get()
      if (active !== undefined)
        return resultErrorCreate(
          op,
          `An active storage migration already exists for environment ${parsed.output.environmentId}`,
        )
      const issuedIntents = storageMigrationIssuedUploadsAssert(transaction, parsed.output.environmentId, now, op)
      if (!issuedIntents.success) return issuedIntents

      const inserted = databaseRecordInsert(transaction, storageMigrationTable, {
        id: `storage-migration-${crypto.randomUUID()}`,
        projectId: parsed.output.projectId,
        environmentId: parsed.output.environmentId,
        idempotencyKey: parsed.output.idempotencyKey,
        sourceBinding: parsed.output.sourceBinding,
        targetBinding: parsed.output.targetBinding,
        status: "queued",
        progress: storageMigrationProgressCreate(),
        sourceInventoryFingerprint: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      })
      if (!inserted.success) return inserted as Result<StorageMigration>
      return storageMigrationRecordRead(inserted.data, op)
    }

    if (transactionInput !== undefined) return create(transactionInput)
    return databaseTransactionRun<StorageMigration>(db, create, { behavior: "immediate" })
  }

  const storageMigrationRead: StorageMigrationRepository["storageMigrationRead"] = (migrationId) => {
    const op = "storageMigrationRead"
    try {
      const record = db.select().from(storageMigrationTable).where(eq(storageMigrationTable.id, migrationId)).get()
      if (record === undefined) return { success: true, data: null }
      return storageMigrationRecordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The storage migration could not be read", error)
    }
  }

  const storageMigrationReadByIdempotencyKey: StorageMigrationRepository["storageMigrationReadByIdempotencyKey"] = (
    environmentId,
    idempotencyKey,
  ) => {
    const op = "storageMigrationReadByIdempotencyKey"
    try {
      const record = db
        .select()
        .from(storageMigrationTable)
        .where(
          and(
            eq(storageMigrationTable.environmentId, environmentId),
            eq(storageMigrationTable.idempotencyKey, idempotencyKey),
          ),
        )
        .get()
      if (record === undefined) return { success: true, data: null }
      return storageMigrationRecordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The storage migration could not be read", error)
    }
  }

  const storageMigrationReadActive: StorageMigrationRepository["storageMigrationReadActive"] = (
    environmentId,
    transactionInput,
  ) => {
    const op = "storageMigrationReadActive"
    try {
      const transaction = transactionInput ?? db
      const record = transaction
        .select()
        .from(storageMigrationTable)
        .where(
          and(
            eq(storageMigrationTable.environmentId, environmentId),
            inArray(storageMigrationTable.status, [...activeStatuses]),
          ),
        )
        .get()
      if (record === undefined) return { success: true, data: null }
      return storageMigrationRecordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The active storage migration could not be read", error)
    }
  }

  const storageMigrationOwnershipAssert: StorageMigrationRepository["storageMigrationOwnershipAssert"] = (
    migrationId,
    ownership,
    nowInput,
  ) => {
    const op = "storageMigrationOwnershipAssert"
    try {
      const now = new Date(nowInput ?? clock()).toISOString()
      return databaseTransactionRun<null>(
        db,
        (transaction) => storageMigrationJobOwnershipAssert(transaction, migrationId, ownership, now, op),
        { behavior: "immediate" },
      )
    } catch (error) {
      return resultErrorCreate(op, "The storage migration ownership could not be checked", error)
    }
  }

  const storageMigrationStatusUpdate: StorageMigrationRepository["storageMigrationStatusUpdate"] = (
    migrationId,
    status,
    options,
  ) => {
    const op = "storageMigrationStatusUpdate"
    const parsedStatus = v.safeParse(storageMigrationStatusSchema, status)
    if (!parsedStatus.success) return resultErrorCreate(op, v.summarize(parsedStatus.issues), status)
    if (options.lastError !== undefined && options.lastError !== null && typeof options.lastError !== "string")
      return resultErrorCreate(op, "Migration error must be a string or null", options.lastError)
    try {
      return databaseTransactionRun<StorageMigration>(
        db,
        (transaction) => {
          const current = transaction
            .select()
            .from(storageMigrationTable)
            .where(eq(storageMigrationTable.id, migrationId))
            .get()
          if (current === undefined) return resultErrorCreate(op, "The storage migration does not exist")
          const currentMigration = storageMigrationRecordRead(current, op)
          if (!currentMigration.success) return currentMigration
          const now = new Date(options.now ?? clock()).toISOString()
          const owned = storageMigrationJobOwnershipAssert(transaction, migrationId, options.ownership, now, op)
          if (!owned.success) return owned
          if (currentMigration.data.status === parsedStatus.output) return currentMigration
          if (!statusTransitions[currentMigration.data.status].includes(parsedStatus.output))
            return resultErrorCreate(
              op,
              terminalStatuses.has(currentMigration.data.status)
                ? "A terminal storage migration cannot change status"
                : `A storage migration cannot change status from ${currentMigration.data.status} to ${parsedStatus.output}`,
            )
          const terminal = terminalStatuses.has(parsedStatus.output)
          const updated = transaction
            .update(storageMigrationTable)
            .set({
              status: parsedStatus.output,
              lastError: options.lastError === undefined ? current.lastError : options.lastError,
              updatedAt: now,
              startedAt: current.startedAt ?? (parsedStatus.output === "running" ? now : null),
              completedAt: terminal ? (current.completedAt ?? now) : null,
            })
            .where(eq(storageMigrationTable.id, migrationId))
            .returning()
            .get()
          if (updated === undefined)
            return resultErrorCreate(op, "The storage migration disappeared during status update")
          return storageMigrationRecordRead(updated, op)
        },
        { behavior: "immediate" },
      )
    } catch (error) {
      return resultErrorCreate(op, "The storage migration status could not be updated", error)
    }
  }

  const storageMigrationProgressUpdate: StorageMigrationRepository["storageMigrationProgressUpdate"] = (
    migrationId,
    progress,
    options,
  ) => {
    const op = "storageMigrationProgressUpdate"
    const parsedProgress = v.safeParse(storageMigrationProgressSchema, progress)
    if (!parsedProgress.success) return resultErrorCreate(op, v.summarize(parsedProgress.issues), progress)
    if (
      options.sourceInventoryFingerprint !== undefined &&
      !v.safeParse(sha256Schema, options.sourceInventoryFingerprint).success
    )
      return resultErrorCreate(op, "The source inventory fingerprint is invalid", options.sourceInventoryFingerprint)
    try {
      const now = new Date(options.now ?? clock()).toISOString()
      return databaseTransactionRun<StorageMigration>(
        db,
        (transaction) => {
          const current = transaction
            .select()
            .from(storageMigrationTable)
            .where(eq(storageMigrationTable.id, migrationId))
            .get()
          if (current === undefined) return resultErrorCreate(op, "The storage migration does not exist")
          const currentMigration = storageMigrationRecordRead(current, op)
          if (!currentMigration.success) return currentMigration
          const owned = storageMigrationJobOwnershipAssert(transaction, migrationId, options.ownership, now, op)
          if (!owned.success) return owned
          if (terminalStatuses.has(currentMigration.data.status))
            return resultErrorCreate(op, "A terminal storage migration cannot update progress")
          const progressError = storageMigrationProgressUpdateValidate(
            currentMigration.data.progress,
            parsedProgress.output,
          )
          if (progressError !== null) return resultErrorCreate(op, progressError)
          if (
            options.sourceInventoryFingerprint !== undefined &&
            currentMigration.data.sourceInventoryFingerprint !== null &&
            currentMigration.data.sourceInventoryFingerprint !== options.sourceInventoryFingerprint
          )
            return resultErrorCreate(op, "The source inventory fingerprint cannot change", undefined, {
              retryable: false,
            })

          const updated = transaction
            .update(storageMigrationTable)
            .set({
              progress: parsedProgress.output,
              ...(options.sourceInventoryFingerprint === undefined
                ? {}
                : { sourceInventoryFingerprint: options.sourceInventoryFingerprint }),
              updatedAt: now,
            })
            .where(eq(storageMigrationTable.id, migrationId))
            .returning()
            .get()
          if (updated === undefined)
            return resultErrorCreate(op, "The storage migration disappeared during progress update")
          return storageMigrationRecordRead(updated, op)
        },
        { behavior: "immediate" },
      )
    } catch (error) {
      return resultErrorCreate(op, "The storage migration progress could not be updated", error)
    }
  }

  const storageMigrationCutover: StorageMigrationRepository["storageMigrationCutover"] = (
    migrationId,
    ownership,
    nowInput,
  ) => {
    const op = "storageMigrationCutover"
    try {
      const now = new Date(nowInput ?? clock()).toISOString()
      return databaseTransactionRun<StorageMigration>(
        db,
        (transaction) => {
          const current = transaction
            .select()
            .from(storageMigrationTable)
            .where(eq(storageMigrationTable.id, migrationId))
            .get()
          if (current === undefined) return resultErrorCreate(op, "The storage migration does not exist")
          const migration = storageMigrationRecordRead(current, op)
          if (!migration.success) return migration
          const owned = storageMigrationJobOwnershipAssert(transaction, migrationId, ownership, now, op)
          if (!owned.success) return owned
          if (migration.data.status !== "running")
            return resultErrorCreate(op, "Only a running storage migration can cut over")
          if (!storageMigrationProgressCutoverReady(migration.data.progress))
            return resultErrorCreate(op, "Only a verified storage migration can cut over")
          if (
            migration.data.sourceBinding.bucket !== migration.data.targetBinding.bucket ||
            migration.data.sourceBinding.prefix !== migration.data.targetBinding.prefix
          ) {
            if (migration.data.sourceInventoryFingerprint === null)
              return resultErrorCreate(
                op,
                "A storage migration must bind a source inventory before cutover",
                undefined,
                { retryable: false },
              )
          }

          const environment = transaction
            .select()
            .from(environmentTable)
            .where(
              and(
                eq(environmentTable.id, migration.data.environmentId),
                eq(environmentTable.projectId, migration.data.projectId),
              ),
            )
            .get()
          if (environment === undefined) return resultErrorCreate(op, "The migration environment does not exist")

          const sourceMatches = storageMigrationSourceMatchesEnvironment(migration.data.sourceBinding, environment)
          const targetMatches = storageMigrationSourceMatchesEnvironment(migration.data.targetBinding, environment)
          if (!sourceMatches && !targetMatches)
            return resultErrorCreate(
              op,
              "The migration source settings no longer match the environment",
              { code: "storage_migration_source_conflict", environmentId: migration.data.environmentId },
              { retryable: false },
            )

          const issuedIntents = storageMigrationIssuedUploadsAssert(transaction, migration.data.environmentId, now, op)
          if (!issuedIntents.success) return issuedIntents

          if (sourceMatches) {
            const rewritten = storageMigrationPendingUploadsRewrite(transaction, migration.data, now, op)
            if (!rewritten.success) return rewritten
          }

          if (sourceMatches) {
            transaction
              .update(environmentTable)
              .set({
                r2Bucket: migration.data.targetBinding.bucket,
                r2Prefix: migration.data.targetBinding.prefix,
                publicBaseUrl: migration.data.targetBinding.publicBaseUrl,
                updatedAt: now,
              })
              .where(eq(environmentTable.id, environment.id))
              .run()
          }

          const updated = transaction
            .update(storageMigrationTable)
            .set({
              status: "succeeded",
              lastError: null,
              progress: { ...migration.data.progress, phase: "completed", currentObjectKey: null },
              updatedAt: now,
              startedAt: migration.data.startedAt ?? now,
              completedAt: migration.data.completedAt ?? now,
            })
            .where(eq(storageMigrationTable.id, migrationId))
            .returning()
            .get()
          if (updated === undefined) return resultErrorCreate(op, "The storage migration disappeared during cutover")
          return storageMigrationRecordRead(updated, op)
        },
        { behavior: "immediate" },
      )
    } catch (error) {
      return resultErrorCreate(op, "The storage migration cutover could not be completed", error)
    }
  }

  return {
    storageMigrationCreate,
    storageMigrationRead,
    storageMigrationReadByIdempotencyKey,
    storageMigrationReadActive,
    storageMigrationOwnershipAssert,
    storageMigrationStatusUpdate,
    storageMigrationProgressUpdate,
    storageMigrationCutover,
  }
}

function storageMigrationJobOwnershipAssert(
  transaction: AssetDatabase,
  migrationId: string,
  ownership: StorageMigrationOwnership,
  now: string,
  op: string,
): Result<null> {
  const job = transaction.select().from(jobTable).where(eq(jobTable.id, ownership.jobId)).get()
  if (
    job === undefined ||
    job.kind !== "migrate_storage" ||
    job.status !== "running" ||
    job.leaseOwner !== ownership.workerId ||
    job.leaseToken !== ownership.leaseToken ||
    job.leaseExpiresAt === null ||
    Date.parse(job.leaseExpiresAt) <= Date.parse(now) ||
    job.payload.storageMigrationId !== migrationId
  )
    return resultErrorCreate(
      op,
      "The storage migration job lease is no longer owned",
      { jobId: ownership.jobId, migrationId },
      { retryable: true },
    )
  return { success: true, data: null }
}

function storageMigrationIssuedUploadsAssert(
  transaction: AssetDatabase,
  environmentId: string,
  now: string,
  op: string,
): Result<null> {
  const nowTimestamp = Date.parse(now)
  if (!Number.isFinite(nowTimestamp)) return resultErrorCreate(op, "The storage migration timestamp was invalid")

  const uploads = transaction
    .select()
    .from(uploadTable)
    .where(and(eq(uploadTable.environmentId, environmentId), inArray(uploadTable.status, ["pending", "verified"])))
    .all()
  for (const upload of uploads) {
    if (upload.issuedBucket === null && upload.issuedObjectKey === null && upload.issuedExpiresAt === null) continue
    if (upload.issuedBucket === null || upload.issuedObjectKey === null || upload.issuedExpiresAt === null)
      return resultErrorCreate(op, `Upload ${upload.id} has an incomplete issued storage intent`)
    const expiresAt = Date.parse(upload.issuedExpiresAt)
    if (!Number.isFinite(expiresAt)) return resultErrorCreate(op, `Upload ${upload.id} has an invalid issued expiry`)
    if (expiresAt > nowTimestamp)
      return resultErrorCreate(
        op,
        `Upload ${upload.id} has an unexpired issued storage intent that is still active`,
        {
          code: "upload_intent_active",
          environmentId,
          uploadId: upload.id,
          expiresAt: upload.issuedExpiresAt,
        },
        { retryable: true },
      )
  }
  return { success: true, data: null }
}

function storageMigrationPendingUploadsRewrite(
  transaction: AssetDatabase,
  migration: StorageMigration,
  now: string,
  op: string,
): Result<null> {
  const sourceBinding = storageMigrationBindingStorageRead(migration.sourceBinding)
  const targetBinding = storageMigrationBindingStorageRead(migration.targetBinding)
  const uploads = transaction
    .select()
    .from(uploadTable)
    .where(
      and(eq(uploadTable.environmentId, migration.environmentId), inArray(uploadTable.status, ["pending", "verified"])),
    )
    .all()
  for (const upload of uploads) {
    const source = storageStagingObjectKeyCreate(sourceBinding, upload.id)
    if (!source.success) return resultErrorCreate(op, `Upload ${upload.id} has an invalid staging key`, source)
    if (upload.stagingObjectKey !== source.data.objectKey) continue
    const target = storageStagingObjectKeyCreate(targetBinding, upload.id)
    if (!target.success) return resultErrorCreate(op, `Upload ${upload.id} has an invalid target staging key`, target)
    const values: Partial<typeof uploadTable.$inferInsert> = {
      stagingObjectKey: target.data.objectKey,
      updatedAt: now,
    }
    if (upload.issuedBucket === source.data.bucket && upload.issuedObjectKey === source.data.objectKey) {
      values.issuedBucket = target.data.bucket
      values.issuedObjectKey = target.data.objectKey
    }
    transaction.update(uploadTable).set(values).where(eq(uploadTable.id, upload.id)).run()
  }
  return { success: true, data: null }
}

function storageMigrationBindingStorageRead(binding: StorageMigration["sourceBinding"]): {
  projectId: string
  environment: StorageMigration["sourceBinding"]["environment"]
  bucket: string
  prefix: string
  publicBaseUrl: string
} {
  return {
    projectId: binding.projectId,
    environment: binding.environment,
    bucket: binding.bucket,
    prefix: binding.prefix,
    publicBaseUrl: binding.publicBaseUrl,
  }
}

function storageMigrationProgressCreate(): StorageMigrationProgress {
  return {
    phase: "discovering",
    totalObjects: 0,
    discoveredObjects: 0,
    copiedObjects: 0,
    verifiedObjects: 0,
    totalBytes: 0,
    copiedBytes: 0,
    currentObjectKey: null,
  }
}

function storageMigrationIdentityMatches(
  migration: StorageMigration,
  input: {
    projectId: string
    environmentId: string
    idempotencyKey: string
    sourceBinding: StorageMigration["sourceBinding"]
    targetBinding: StorageMigration["targetBinding"]
  },
): boolean {
  return (
    migration.projectId === input.projectId &&
    migration.environmentId === input.environmentId &&
    storageMigrationBindingMatches(migration.sourceBinding, input.sourceBinding) &&
    storageMigrationBindingMatches(migration.targetBinding, input.targetBinding)
  )
}

function storageMigrationBindingMatches(
  left: StorageMigration["sourceBinding"],
  right: StorageMigration["sourceBinding"],
): boolean {
  return (
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.environment === right.environment &&
    left.bucket === right.bucket &&
    left.prefix === right.prefix &&
    left.publicBaseUrl === right.publicBaseUrl
  )
}

function storageMigrationSourceMatchesEnvironment(
  source: StorageMigration["sourceBinding"],
  environment: typeof environmentTable.$inferSelect,
): boolean {
  const parsed = v.safeParse(storageMigrationBindingSnapshotSchema, source)
  if (!parsed.success) return false
  const current: Pick<Environment, "projectId" | "id" | "name" | "r2Bucket" | "r2Prefix" | "publicBaseUrl"> = {
    projectId: environment.projectId,
    id: environment.id,
    name: environment.name,
    r2Bucket: environment.r2Bucket,
    r2Prefix: environment.r2Prefix,
    publicBaseUrl: environment.publicBaseUrl,
  }
  return (
    parsed.output.projectId === current.projectId &&
    parsed.output.environmentId === current.id &&
    parsed.output.environment === current.name &&
    parsed.output.bucket === current.r2Bucket &&
    parsed.output.prefix === current.r2Prefix &&
    parsed.output.publicBaseUrl === current.publicBaseUrl
  )
}

function storageMigrationProgressUpdateValidate(
  current: StorageMigrationProgress,
  next: StorageMigrationProgress,
): string | null {
  const phaseOrder: Record<StorageMigrationProgress["phase"], number> = {
    discovering: 0,
    copying: 1,
    verifying: 2,
    cutting_over: 3,
    completed: 4,
  }
  if (phaseOrder[next.phase] < phaseOrder[current.phase]) return "Migration progress cannot move to an earlier phase"
  if (next.phase === "completed") return "Only migration cutover can complete progress"

  const counters: Array<keyof Omit<StorageMigrationProgress, "phase" | "currentObjectKey">> = [
    "totalObjects",
    "discoveredObjects",
    "copiedObjects",
    "verifiedObjects",
    "totalBytes",
    "copiedBytes",
  ]
  for (const counter of counters) {
    if (next[counter] < current[counter]) return `Migration progress cannot reduce ${counter}`
  }
  if (next.discoveredObjects > next.totalObjects) return "Discovered objects cannot exceed total objects"
  if (next.copiedObjects > next.discoveredObjects) return "Copied objects cannot exceed discovered objects"
  if (next.verifiedObjects > next.copiedObjects) return "Verified objects cannot exceed copied objects"
  if (next.copiedBytes > next.totalBytes) return "Copied bytes cannot exceed total bytes"
  return null
}

function storageMigrationProgressCutoverReady(progress: StorageMigrationProgress): boolean {
  return (
    (progress.phase === "verifying" || progress.phase === "cutting_over") &&
    progress.discoveredObjects === progress.totalObjects &&
    progress.copiedObjects === progress.discoveredObjects &&
    progress.verifiedObjects === progress.copiedObjects &&
    progress.copiedBytes === progress.totalBytes
  )
}
