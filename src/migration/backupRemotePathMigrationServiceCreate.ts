import { createHash } from "node:crypto"

import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"

import { backupReceiptSchema } from "../backup/backupReceiptSchema.js"
import { rcloneRemotePathCreate } from "../backup/rcloneRemotePathCreate.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../infrastructure/db/schema/backupReceiptTable.js"
import { organizationTable } from "../infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../infrastructure/db/schema/sourceRevisionTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { BackupRemotePathMigrationAdapter } from "./backupRemotePathMigrationAdapter.js"
import { backupRemotePathMigrationRunTable } from "./backupRemotePathMigrationRunTable.js"

type BackupRemotePathMigrationServiceCreateInput = {
  db: AssetDatabase
  adapter: BackupRemotePathMigrationAdapter
  clock?: () => Date
}

type MigrationItem = {
  receiptId: string
  projectId: string
  sourceRevisionId: string
  oldRemotePath: string
  destinationRemotePath: string
  byteSize: number
  sha256: string
}

type MigrationCollision = {
  destination: string
  receiptIds: string[]
  reason: string
}

type MigrationMissingItem = {
  destination: string
  receiptIds: string[]
  reason: string
}

type MigrationSkippedItem = {
  receiptId: string
  reason: string
}

type MigrationRunStatus = "running" | "blocked" | "succeeded"

type MigrationReport = {
  runId: string | null
  fingerprint: string
  dryRun: boolean
  status: "planned" | MigrationRunStatus
  totalReceipts: number
  plannedReceiptIds: string[]
  completedReceiptIds: string[]
  skippedItems: MigrationSkippedItem[]
  collisions: MigrationCollision[]
  missingItems: MigrationMissingItem[]
}

type MigrationInput = {
  dryRun?: boolean
  runId?: string
  signal?: AbortSignal
}

type MigrationInventory = {
  items: MigrationItem[]
  fingerprint: string
}

type MigrationRemoteObjectCheck = {
  collisions: MigrationCollision[]
  missingItems: MigrationMissingItem[]
}

type MigrationItemOutcome = { state: "ready"; receiptRemotePath: string } | { state: "skipped"; reason: string }

export const backupRemotePathMigrationServiceCreate = (input: BackupRemotePathMigrationServiceCreateInput) => {
  const clock = input.clock ?? (() => new Date())

  const migrate = async (migrationInput: MigrationInput = {}): Promise<Result<MigrationReport>> => {
    const op = "backupRemotePathMigrationServiceMigrate"
    const dryRun = migrationInput.dryRun ?? true
    if (dryRun && migrationInput.runId !== undefined)
      return resultErrorCreate(op, "A migration run can only be resumed in execute mode")

    const inventory = inventoryRead(input.db)
    if (!inventory.success) return inventory
    const remoteObjects = await migrationRemoteObjectsRead(input.adapter, inventory.data.items, migrationInput.signal)
    if (!remoteObjects.success) return remoteObjects

    if (dryRun) {
      return {
        success: true,
        data: migrationReportCreate({
          runId: null,
          fingerprint: inventory.data.fingerprint,
          dryRun: true,
          status: "planned",
          items: inventory.data.items,
          completedReceiptIds: [],
          skippedItems: [],
          collisions: remoteObjects.data.collisions,
          missingItems: remoteObjects.data.missingItems,
        }),
      }
    }

    const now = new Date(clock()).toISOString()
    const run =
      migrationInput.runId === undefined
        ? migrationRunReadOrCreate(input.db, inventory.data.fingerprint, now)
        : migrationRunReadById(input.db, migrationInput.runId)
    if (!run.success) return run
    if (run.data.fingerprint !== inventory.data.fingerprint)
      return resultErrorCreate(op, "The migration run does not match the current verified receipt inventory")

    if (remoteObjects.data.collisions.length > 0) {
      if (run.data.status === "blocked" && migrationInput.runId === undefined)
        return resultErrorCreate(op, `The migration run is blocked; resume it with --resume ${run.data.id}`)
      const blocked = migrationRunUpdate(input.db, run.data.id, {
        status: "blocked",
        completedReceiptIds: run.data.completedReceiptIds,
        skippedItems: run.data.skippedItems,
        collisionItems: remoteObjects.data.collisions,
        lastError: "Destination collisions must be resolved before execution",
        updatedAt: now,
        completedAt: null,
      })
      if (!blocked.success) return blocked
      return {
        success: true,
        data: migrationReportCreate({
          runId: run.data.id,
          fingerprint: inventory.data.fingerprint,
          dryRun: false,
          status: "blocked",
          items: inventory.data.items,
          completedReceiptIds: run.data.completedReceiptIds,
          skippedItems: run.data.skippedItems,
          collisions: remoteObjects.data.collisions,
          missingItems: remoteObjects.data.missingItems,
        }),
      }
    }

    const missingCanonicalItems = migrationMissingCanonicalItemsRead(
      inventory.data.items,
      remoteObjects.data.missingItems,
    )
    if (missingCanonicalItems.length > 0) {
      if (run.data.status === "blocked" && migrationInput.runId === undefined)
        return resultErrorCreate(op, `The migration run is blocked; resume it with --resume ${run.data.id}`)
      const blocked = migrationRunUpdate(input.db, run.data.id, {
        status: "blocked",
        completedReceiptIds: run.data.completedReceiptIds,
        skippedItems: run.data.skippedItems,
        collisionItems: [],
        lastError: "A canonical destination is missing for a canonical receipt",
        updatedAt: now,
        completedAt: null,
      })
      if (!blocked.success) return blocked
      return {
        success: true,
        data: migrationReportCreate({
          runId: run.data.id,
          fingerprint: inventory.data.fingerprint,
          dryRun: false,
          status: "blocked",
          items: inventory.data.items,
          completedReceiptIds: run.data.completedReceiptIds,
          skippedItems: run.data.skippedItems,
          collisions: [],
          missingItems: remoteObjects.data.missingItems,
        }),
      }
    }

    if (
      run.data.status === "succeeded" &&
      run.data.skippedItems.length === 0 &&
      run.data.completedReceiptIds.length === inventory.data.items.length &&
      inventory.data.items.every(
        (item) =>
          item.oldRemotePath === item.destinationRemotePath && run.data.completedReceiptIds.includes(item.receiptId),
      )
    ) {
      return {
        success: true,
        data: migrationReportCreate({
          runId: run.data.id,
          fingerprint: inventory.data.fingerprint,
          dryRun: false,
          status: "succeeded",
          items: inventory.data.items,
          completedReceiptIds: run.data.completedReceiptIds,
          skippedItems: run.data.skippedItems,
          collisions: [],
          missingItems: [],
        }),
      }
    }

    if (run.data.status === "blocked") {
      if (migrationInput.runId === undefined)
        return resultErrorCreate(op, `The migration run is blocked; resume it with --resume ${run.data.id}`)
      const unblocked = migrationRunUpdate(input.db, run.data.id, {
        status: "running",
        completedReceiptIds: run.data.completedReceiptIds,
        skippedItems: run.data.skippedItems,
        collisionItems: [],
        lastError: null,
        updatedAt: now,
        completedAt: null,
      })
      if (!unblocked.success) return unblocked
    }

    const skippedReceiptIds = new Set(run.data.skippedItems.map((item) => item.receiptId))
    const completedReceiptIds = new Set(
      run.data.completedReceiptIds.filter(
        (id) =>
          !skippedReceiptIds.has(id) &&
          inventory.data.items.some(
            (item) => item.receiptId === id && item.oldRemotePath === item.destinationRemotePath,
          ),
      ),
    )
    const skippedItems = [...run.data.skippedItems]
    for (const item of inventory.data.items) {
      if (completedReceiptIds.has(item.receiptId)) continue
      const outcome = await migrationItemPrepare(input.adapter, input.db, item, migrationInput.signal)
      if (!outcome.success) return migrationFailurePersist(input.db, run.data.id, now, outcome)
      const persisted =
        outcome.data.state === "ready"
          ? migrationReceiptAndJournalPersist(
              input.db,
              run.data.id,
              item,
              outcome.data.receiptRemotePath,
              completedReceiptIds,
              skippedItems,
              now,
            )
          : migrationJournalPersist(
              input.db,
              run.data.id,
              item.receiptId,
              outcome.data.reason,
              completedReceiptIds,
              skippedItems,
              now,
            )
      if (!persisted.success) return persisted
    }

    const finalRemoteObjects = await migrationRemoteObjectsRead(
      input.adapter,
      inventory.data.items,
      migrationInput.signal,
    )
    if (!finalRemoteObjects.success) return migrationFailurePersist(input.db, run.data.id, now, finalRemoteObjects)
    const finalStatus =
      skippedItems.length === 0 &&
      finalRemoteObjects.data.missingItems.length === 0 &&
      finalRemoteObjects.data.collisions.length === 0
        ? "succeeded"
        : "blocked"
    const completed = migrationRunUpdate(input.db, run.data.id, {
      status: finalStatus,
      completedReceiptIds: [...completedReceiptIds],
      skippedItems,
      collisionItems: finalRemoteObjects.data.collisions,
      lastError:
        finalStatus === "succeeded"
          ? null
          : skippedItems.length > 0
            ? "Some verified receipts changed during migration and require review"
            : "Canonical destination verification found missing or mismatched objects",
      updatedAt: now,
      completedAt: finalStatus === "succeeded" ? now : null,
    })
    if (!completed.success) return completed
    return {
      success: true,
      data: migrationReportCreate({
        runId: run.data.id,
        fingerprint: inventory.data.fingerprint,
        dryRun: false,
        status: finalStatus,
        items: inventory.data.items,
        completedReceiptIds: [...completedReceiptIds],
        skippedItems,
        collisions: finalRemoteObjects.data.collisions,
        missingItems: finalRemoteObjects.data.missingItems,
      }),
    }
  }

  const plan = (migrationInput: Omit<MigrationInput, "dryRun"> = {}) => migrate({ ...migrationInput, dryRun: true })
  const apply = (migrationInput: Omit<MigrationInput, "dryRun"> = {}) => migrate({ ...migrationInput, dryRun: false })

  return { migrate, plan, apply }
}

function inventoryRead(db: AssetDatabase): Result<MigrationInventory> {
  const op = "backupRemotePathMigrationInventoryRead"
  try {
    const records = db
      .select({
        receiptId: backupReceiptTable.id,
        receiptProjectId: backupReceiptTable.projectId,
        receiptSourceRevisionId: backupReceiptTable.sourceRevisionId,
        receiptJobId: backupReceiptTable.jobId,
        oldRemotePath: backupReceiptTable.remotePath,
        receiptByteSize: backupReceiptTable.byteSize,
        receiptSha256: backupReceiptTable.sha256,
        receiptCheckResult: backupReceiptTable.checkResult,
        receiptCompletedAt: backupReceiptTable.completedAt,
        sourceRevisionId: sourceRevisionTable.id,
        sourceOriginalFilename: sourceRevisionTable.originalFilename,
        sourceByteSize: sourceRevisionTable.byteSize,
        sourceSha256: sourceRevisionTable.sha256,
        assetProjectId: assetTable.projectId,
        folder1: assetTable.folder1,
        folder2: assetTable.folder2,
        folder3: assetTable.folder3,
        organizationName: organizationTable.slug,
        projectName: projectTable.slug,
      })
      .from(backupReceiptTable)
      .leftJoin(sourceRevisionTable, eq(sourceRevisionTable.id, backupReceiptTable.sourceRevisionId))
      .leftJoin(assetTable, eq(assetTable.id, sourceRevisionTable.assetId))
      .leftJoin(projectTable, eq(projectTable.id, assetTable.projectId))
      .leftJoin(organizationTable, eq(organizationTable.id, projectTable.organizationId))
      .where(eq(backupReceiptTable.checkResult, "verified"))
      .orderBy(asc(backupReceiptTable.id))
      .all()

    const items: MigrationItem[] = []
    for (const record of records) {
      const receipt = v.safeParse(backupReceiptSchema, {
        id: record.receiptId,
        projectId: record.receiptProjectId,
        sourceRevisionId: record.receiptSourceRevisionId,
        jobId: record.receiptJobId,
        remotePath: record.oldRemotePath,
        byteSize: record.receiptByteSize,
        sha256: record.receiptSha256,
        checkResult: record.receiptCheckResult,
        completedAt: record.receiptCompletedAt,
      })
      if (!receipt.success) return resultErrorCreate(op, "A stored verified backup receipt is invalid", receipt.issues)
      if (
        record.sourceRevisionId === null ||
        record.sourceOriginalFilename === null ||
        record.sourceByteSize === null ||
        record.sourceSha256 === null ||
        record.assetProjectId === null ||
        record.organizationName === null ||
        record.projectName === null
      ) {
        return resultErrorCreate(op, `Verified backup receipt ${receipt.output.id} is missing source metadata`)
      }
      if (record.sourceRevisionId !== record.receiptSourceRevisionId)
        return resultErrorCreate(op, "A backup receipt source revision does not match its source metadata")
      if (record.assetProjectId !== record.receiptProjectId)
        return resultErrorCreate(op, "A backup receipt project does not match its source metadata")
      if (record.sourceByteSize !== receipt.output.byteSize || record.sourceSha256 !== receipt.output.sha256)
        return resultErrorCreate(op, "A verified backup receipt does not match its source revision metadata")

      const destination = rcloneRemotePathCreate({
        remote: "gdrive_beta",
        backupRoot: "backups",
        organizationName: record.organizationName,
        projectName: record.projectName,
        logicalFolders: [record.folder1, record.folder2, record.folder3].filter(
          (folder): folder is string => folder !== null,
        ),
        sourceRevisionId: record.sourceRevisionId,
        originalFilename: record.sourceOriginalFilename,
      })
      if (!destination.success) return destination
      items.push({
        receiptId: receipt.output.id,
        projectId: receipt.output.projectId,
        sourceRevisionId: receipt.output.sourceRevisionId,
        oldRemotePath: receipt.output.remotePath,
        destinationRemotePath: destination.data,
        byteSize: receipt.output.byteSize,
        sha256: receipt.output.sha256,
      })
    }

    return { success: true, data: { items, fingerprint: migrationFingerprintCreate(items) } }
  } catch (error) {
    return resultErrorCreate(op, "Verified backup receipt inventory could not be read", error)
  }
}

async function migrationRemoteObjectsRead(
  adapter: BackupRemotePathMigrationAdapter,
  items: readonly MigrationItem[],
  signal?: AbortSignal,
): Promise<Result<MigrationRemoteObjectCheck>> {
  const collisions = new Map<string, MigrationCollision>()
  const missingItems = new Map<string, MigrationMissingItem>()
  const destinationItems = new Map<string, MigrationItem[]>()
  for (const item of items) {
    const existing = destinationItems.get(item.destinationRemotePath) ?? []
    existing.push(item)
    destinationItems.set(item.destinationRemotePath, existing)
  }

  for (const [destination, destinationRecords] of destinationItems) {
    if (destinationRecords.length > 1) {
      collisions.set(destination, {
        destination,
        receiptIds: destinationRecords.map((item) => item.receiptId),
        reason: "multiple verified receipts derive the same destination",
      })
    }

    for (const item of destinationRecords) {
      const state = await adapter.remoteObjectVerify({
        remotePath: destination,
        expectedByteSize: item.byteSize,
        expectedSha256: item.sha256,
        signal,
      })
      if (!state.success) return state
      if (state.data === "missing") {
        const existing = missingItems.get(destination)
        if (existing === undefined) {
          missingItems.set(destination, {
            destination,
            receiptIds: [item.receiptId],
            reason: "canonical destination object is missing",
          })
        } else {
          existing.receiptIds.push(item.receiptId)
        }
      }
      if (state.data === "mismatch" && destinationRecords.length === 1)
        collisions.set(destination, {
          destination,
          receiptIds: [item.receiptId],
          reason: "destination object exists with a different byte size or SHA-256",
        })
    }
  }
  return {
    success: true,
    data: {
      collisions: [...collisions.values()].toSorted((left, right) => left.destination.localeCompare(right.destination)),
      missingItems: [...missingItems.values()].toSorted((left, right) =>
        left.destination.localeCompare(right.destination),
      ),
    },
  }
}

function migrationMissingCanonicalItemsRead(
  items: readonly MigrationItem[],
  missingItems: readonly MigrationMissingItem[],
): MigrationMissingItem[] {
  const canonicalReceiptIds = new Set(
    items.filter((item) => item.oldRemotePath === item.destinationRemotePath).map((item) => item.receiptId),
  )
  return missingItems
    .map((missing) => ({
      ...missing,
      receiptIds: missing.receiptIds.filter((receiptId) => canonicalReceiptIds.has(receiptId)),
    }))
    .filter((missing) => missing.receiptIds.length > 0)
}

async function migrationItemPrepare(
  adapter: BackupRemotePathMigrationAdapter,
  db: AssetDatabase,
  item: MigrationItem,
  signal?: AbortSignal,
): Promise<Result<MigrationItemOutcome>> {
  const op = "backupRemotePathMigrationItemPrepare"
  const current = currentReceiptRead(db, item.receiptId)
  if (!current.success) return current
  if (
    current.data === null ||
    current.data.checkResult !== "verified" ||
    current.data.projectId !== item.projectId ||
    current.data.sourceRevisionId !== item.sourceRevisionId ||
    current.data.byteSize !== item.byteSize ||
    current.data.sha256 !== item.sha256
  ) {
    return { success: true, data: { state: "skipped", reason: "verified receipt changed after inventory" } }
  }
  if (current.data.remotePath !== item.oldRemotePath && current.data.remotePath !== item.destinationRemotePath)
    return { success: true, data: { state: "skipped", reason: "receipt remotePath changed after inventory" } }

  if (current.data.remotePath === item.destinationRemotePath) {
    const destination = await adapter.remoteObjectVerify({
      remotePath: item.destinationRemotePath,
      expectedByteSize: item.byteSize,
      expectedSha256: item.sha256,
      signal,
    })
    if (!destination.success) return destination
    if (destination.data !== "verified")
      return resultErrorCreate(op, "The canonical destination is not a verified immutable object")
    return { success: true, data: { state: "ready", receiptRemotePath: item.destinationRemotePath } }
  }

  const source = await adapter.remoteObjectVerify({
    remotePath: item.oldRemotePath,
    expectedByteSize: item.byteSize,
    expectedSha256: item.sha256,
    signal,
  })
  if (!source.success) return source
  if (source.data !== "verified") return resultErrorCreate(op, "The verified source backup object is no longer valid")

  let destination = await adapter.remoteObjectVerify({
    remotePath: item.destinationRemotePath,
    expectedByteSize: item.byteSize,
    expectedSha256: item.sha256,
    signal,
  })
  if (!destination.success) return destination
  if (destination.data === "mismatch")
    return resultErrorCreate(op, "The canonical destination already contains a different object")
  if (destination.data === "missing") {
    const copied = await adapter.remoteObjectCopyImmutable({
      sourceRemotePath: item.oldRemotePath,
      destinationRemotePath: item.destinationRemotePath,
      signal,
    })
    if (!copied.success) {
      const racedDestination = await adapter.remoteObjectVerify({
        remotePath: item.destinationRemotePath,
        expectedByteSize: item.byteSize,
        expectedSha256: item.sha256,
        signal,
      })
      if (!racedDestination.success || racedDestination.data !== "verified") return copied
      destination = racedDestination
    }
  }
  if (destination.data !== "verified") {
    destination = await adapter.remoteObjectVerify({
      remotePath: item.destinationRemotePath,
      expectedByteSize: item.byteSize,
      expectedSha256: item.sha256,
      signal,
    })
    if (!destination.success) return destination
  }
  if (destination.data !== "verified")
    return resultErrorCreate(op, "The copied destination failed byte and SHA-256 verification")
  return { success: true, data: { state: "ready", receiptRemotePath: item.oldRemotePath } }
}

function currentReceiptRead(
  db: AssetDatabase,
  receiptId: string,
): Result<{
  projectId: string
  sourceRevisionId: string
  remotePath: string
  byteSize: number
  sha256: string
  checkResult: "verified" | "failed"
} | null> {
  const op = "backupRemotePathMigrationCurrentReceiptRead"
  try {
    const record = db
      .select({
        projectId: backupReceiptTable.projectId,
        sourceRevisionId: backupReceiptTable.sourceRevisionId,
        remotePath: backupReceiptTable.remotePath,
        byteSize: backupReceiptTable.byteSize,
        sha256: backupReceiptTable.sha256,
        checkResult: backupReceiptTable.checkResult,
      })
      .from(backupReceiptTable)
      .where(eq(backupReceiptTable.id, receiptId))
      .get()
    return { success: true, data: record ?? null }
  } catch (error) {
    return resultErrorCreate(op, "The current backup receipt could not be read", error)
  }
}

function migrationReceiptAndJournalPersist(
  db: AssetDatabase,
  runId: string,
  item: MigrationItem,
  receiptRemotePath: string,
  completedReceiptIds: Set<string>,
  skippedItems: MigrationSkippedItem[],
  now: string,
): Result<null> {
  return databaseTransactionRun(db, (transaction) => {
    const skippedIndex = skippedItems.findIndex((skipped) => skipped.receiptId === item.receiptId)
    if (skippedIndex >= 0) skippedItems.splice(skippedIndex, 1)
    const updated = transaction
      .update(backupReceiptTable)
      .set({ remotePath: item.destinationRemotePath })
      .where(
        and(
          eq(backupReceiptTable.id, item.receiptId),
          eq(backupReceiptTable.projectId, item.projectId),
          eq(backupReceiptTable.sourceRevisionId, item.sourceRevisionId),
          eq(backupReceiptTable.remotePath, receiptRemotePath),
          eq(backupReceiptTable.byteSize, item.byteSize),
          eq(backupReceiptTable.sha256, item.sha256),
          eq(backupReceiptTable.checkResult, "verified"),
        ),
      )
      .returning({ id: backupReceiptTable.id })
      .get()
    if (updated === undefined) {
      const current = transaction
        .select({
          projectId: backupReceiptTable.projectId,
          sourceRevisionId: backupReceiptTable.sourceRevisionId,
          byteSize: backupReceiptTable.byteSize,
          sha256: backupReceiptTable.sha256,
          checkResult: backupReceiptTable.checkResult,
          remotePath: backupReceiptTable.remotePath,
        })
        .from(backupReceiptTable)
        .where(eq(backupReceiptTable.id, item.receiptId))
        .get()
      if (
        current?.checkResult === "verified" &&
        current.projectId === item.projectId &&
        current.sourceRevisionId === item.sourceRevisionId &&
        current.byteSize === item.byteSize &&
        current.sha256 === item.sha256 &&
        current.remotePath === item.destinationRemotePath
      ) {
        completedReceiptIds.add(item.receiptId)
      } else {
        skippedItems.push({ receiptId: item.receiptId, reason: "receipt changed before compare-and-swap" })
      }
    } else {
      completedReceiptIds.add(item.receiptId)
    }
    return migrationJournalRowUpdate(transaction, runId, completedReceiptIds, skippedItems, now)
  })
}

function migrationJournalPersist(
  db: AssetDatabase,
  runId: string,
  receiptId: string,
  reason: string,
  completedReceiptIds: Set<string>,
  skippedItems: MigrationSkippedItem[],
  now: string,
): Result<null> {
  const existingIndex = skippedItems.findIndex((skipped) => skipped.receiptId === receiptId)
  if (existingIndex >= 0) skippedItems.splice(existingIndex, 1)
  skippedItems.push({ receiptId, reason })
  return databaseTransactionRun(db, (transaction) =>
    migrationJournalRowUpdate(transaction, runId, completedReceiptIds, skippedItems, now),
  )
}

function migrationJournalRowUpdate(
  db: AssetDatabase,
  runId: string,
  completedReceiptIds: Set<string>,
  skippedItems: MigrationSkippedItem[],
  now: string,
): Result<null> {
  const updated = db
    .update(backupRemotePathMigrationRunTable)
    .set({
      status: "running",
      completedReceiptIds: [...completedReceiptIds],
      skippedItems,
      collisionItems: [],
      lastError: null,
      updatedAt: now,
      completedAt: null,
    })
    .where(eq(backupRemotePathMigrationRunTable.id, runId))
    .returning({ id: backupRemotePathMigrationRunTable.id })
    .get()
  return updated === undefined
    ? resultErrorCreate("backupRemotePathMigrationJournalRowUpdate", "The migration journal row disappeared")
    : { success: true, data: null }
}

function migrationFailurePersist<T>(db: AssetDatabase, runId: string, now: string, failure: Result<T>): Result<T> {
  if (failure.success) return failure
  const journal = migrationRunUpdate(db, runId, {
    status: "running",
    completedReceiptIds: undefined,
    skippedItems: undefined,
    collisionItems: [],
    lastError: `${failure.op}: ${failure.errorMessage}`,
    updatedAt: now,
    completedAt: null,
  })
  if (!journal.success) return journal
  return failure
}

type MigrationRunUpdate = {
  status: MigrationRunStatus
  completedReceiptIds?: string[]
  skippedItems?: MigrationSkippedItem[]
  collisionItems: MigrationCollision[]
  lastError: string | null
  updatedAt: string
  completedAt: string | null
}

function migrationRunUpdate(db: AssetDatabase, runId: string, update: MigrationRunUpdate): Result<null> {
  const op = "backupRemotePathMigrationRunUpdate"
  try {
    const values = {
      status: update.status,
      ...(update.completedReceiptIds === undefined ? {} : { completedReceiptIds: update.completedReceiptIds }),
      ...(update.skippedItems === undefined ? {} : { skippedItems: update.skippedItems }),
      collisionItems: update.collisionItems,
      lastError: update.lastError,
      updatedAt: update.updatedAt,
      completedAt: update.completedAt,
    }
    const updated = db
      .update(backupRemotePathMigrationRunTable)
      .set(values)
      .where(eq(backupRemotePathMigrationRunTable.id, runId))
      .returning({ id: backupRemotePathMigrationRunTable.id })
      .get()
    return updated === undefined
      ? resultErrorCreate(op, "The migration journal row disappeared")
      : { success: true, data: null }
  } catch (error) {
    return resultErrorCreate(op, "The migration journal could not be updated", error)
  }
}

function migrationRunReadOrCreate(
  db: AssetDatabase,
  fingerprint: string,
  now: string,
): Result<typeof backupRemotePathMigrationRunTable.$inferSelect> {
  const op = "backupRemotePathMigrationRunReadOrCreate"
  try {
    const existing = db
      .select()
      .from(backupRemotePathMigrationRunTable)
      .where(eq(backupRemotePathMigrationRunTable.fingerprint, fingerprint))
      .get()
    if (existing !== undefined) return { success: true, data: existing }
    const inserted = databaseRecordInsert(db, backupRemotePathMigrationRunTable, {
      id: `backup-remote-path-migration-${fingerprint}`,
      fingerprint,
      status: "running",
      completedReceiptIds: [],
      skippedItems: [],
      collisionItems: [],
      lastError: null,
      updatedAt: now,
      completedAt: null,
    })
    if (inserted.success) return inserted
    const raced = db
      .select()
      .from(backupRemotePathMigrationRunTable)
      .where(eq(backupRemotePathMigrationRunTable.fingerprint, fingerprint))
      .get()
    return raced === undefined ? inserted : { success: true, data: raced }
  } catch (error) {
    return resultErrorCreate(op, "The migration journal could not be created", error)
  }
}

function migrationRunReadById(
  db: AssetDatabase,
  runId: string,
): Result<typeof backupRemotePathMigrationRunTable.$inferSelect> {
  const op = "backupRemotePathMigrationRunReadById"
  try {
    const run = db
      .select()
      .from(backupRemotePathMigrationRunTable)
      .where(eq(backupRemotePathMigrationRunTable.id, runId))
      .get()
    return run === undefined
      ? resultErrorCreate(op, "The requested backup remote path migration run does not exist")
      : { success: true, data: run }
  } catch (error) {
    return resultErrorCreate(op, "The migration journal could not be read", error)
  }
}

function migrationFingerprintCreate(items: readonly MigrationItem[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        items.map((item) => ({
          receiptId: item.receiptId,
          projectId: item.projectId,
          sourceRevisionId: item.sourceRevisionId,
          destinationRemotePath: item.destinationRemotePath,
          byteSize: item.byteSize,
          sha256: item.sha256,
        })),
      ),
    )
    .digest("hex")
}

function migrationReportCreate(input: {
  runId: string | null
  fingerprint: string
  dryRun: boolean
  status: "planned" | MigrationRunStatus
  items: readonly MigrationItem[]
  completedReceiptIds: readonly string[]
  skippedItems: readonly MigrationSkippedItem[]
  collisions: readonly MigrationCollision[]
  missingItems: readonly MigrationMissingItem[]
}): MigrationReport {
  const completedReceiptIds = new Set(input.completedReceiptIds)
  return {
    runId: input.runId,
    fingerprint: input.fingerprint,
    dryRun: input.dryRun,
    status: input.status,
    totalReceipts: input.items.length,
    plannedReceiptIds: input.items
      .filter((item) => !completedReceiptIds.has(item.receiptId) && item.oldRemotePath !== item.destinationRemotePath)
      .map((item) => item.receiptId),
    completedReceiptIds: [...input.completedReceiptIds],
    skippedItems: [...input.skippedItems],
    collisions: [...input.collisions],
    missingItems: [...input.missingItems],
  }
}
