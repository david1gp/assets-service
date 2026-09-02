import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { storageMigrationDestinationInventoryVerify } from "../storage/storageMigrationDestinationInventoryVerify.js"
import { storageMigrationInventoryFingerprintCreate } from "../storage/storageMigrationInventoryFingerprintCreate.js"
import type { StorageMigrationInventoryItem } from "../storage/storageMigrationInventoryItem.js"
import { storageMigrationObjectCopy } from "../storage/storageMigrationObjectCopy.js"
import { storageMigrationObjectLocationCreate } from "../storage/storageMigrationObjectLocationCreate.js"
import { storageMigrationSourceInventoryRead } from "../storage/storageMigrationSourceInventoryRead.js"
import type { JobHandler } from "../workflow/jobHandler.js"
import { storageMigrationDestinationPublicUrlVerify } from "./storageMigrationDestinationPublicUrlVerify.js"
import type { StorageMigrationOwnership } from "./storageMigrationOwnership.js"
import { storageMigrationRepositoryCreate } from "./storageMigrationRepositoryCreate.js"
import type { StorageMigration } from "./storageMigrationSchema.js"

type StorageMigrationWorkflowHandleInput = {
  db: AssetDatabase
  storage: StorageAdapter
  clock?: () => Date
  destinationPublicUrlVerifier?: (
    input: Parameters<typeof storageMigrationDestinationPublicUrlVerify>[0],
  ) => Promise<Result<unknown>>
}

export const storageMigrationWorkflowHandle = async (
  job: Parameters<JobHandler>[0],
  handlerContext: Parameters<JobHandler>[1],
  input: StorageMigrationWorkflowHandleInput,
): Promise<Result<null>> => {
  try {
    return await storageMigrationWorkflowHandleRun(job, handlerContext, input)
  } catch (error) {
    return storageMigrationUnexpectedFailure(job, handlerContext, input, error)
  }
}

async function storageMigrationWorkflowHandleRun(
  job: Parameters<JobHandler>[0],
  handlerContext: Parameters<JobHandler>[1],
  input: StorageMigrationWorkflowHandleInput,
): Promise<Result<null>> {
  const op = "storageMigrationWorkflowHandle"
  const parsedPayload = v.safeParse(v.strictObject({ storageMigrationId: idSchema }), job.payload)
  if (!parsedPayload.success)
    return resultErrorCreate(op, "Storage migration job payload is invalid", parsedPayload.issues)
  const ownership = storageMigrationOwnershipRead(job, handlerContext)
  if (!ownership.success) return ownership

  const now = input.clock ?? (() => new Date())
  const repository = storageMigrationRepositoryCreate(input.db, { clock: now })
  const read = repository.storageMigrationRead(parsedPayload.output.storageMigrationId)
  if (!read.success) return read
  if (read.data === null) return resultErrorCreate(op, "The storage migration does not exist")
  if (read.data.status === "succeeded" || read.data.status === "cancelled") return { success: true, data: null }
  if (read.data.status === "failed")
    return resultErrorCreate(op, "The storage migration has already failed", undefined, { retryable: false })

  const running = repository.storageMigrationStatusUpdate(read.data.id, "running", {
    ownership: ownership.data,
    now: now(),
  })
  if (!running.success) return running
  let migration = running.data

  const initialCancellation = await migrationCancellationHandle(
    migration,
    handlerContext,
    repository,
    now,
    ownership.data,
  )
  if (!initialCancellation.success) return initialCancellation
  if (initialCancellation.data) return { success: true, data: null }

  const probed = await input.storage.probeCredentials(migration.targetBinding.bucket)
  const probeCancellation = await migrationCancellationHandle(
    migration,
    handlerContext,
    repository,
    now,
    ownership.data,
  )
  if (!probeCancellation.success) return probeCancellation
  if (probeCancellation.data) return { success: true, data: null }
  if (!probed.success) return migrationFailurePersist(repository, migration, job, ownership.data, probed)
  if (!probed.data.reachable)
    return migrationFailurePersist(
      repository,
      migration,
      job,
      ownership.data,
      resultErrorCreate(op, "The target storage bucket is not reachable", probed.data),
    )

  const storageChanged =
    migration.sourceBinding.bucket !== migration.targetBinding.bucket ||
    migration.sourceBinding.prefix !== migration.targetBinding.prefix
  let inventory: readonly StorageMigrationInventoryItem[] = []
  if (storageChanged) {
    const discovered = await storageMigrationSourceInventoryRead(input.storage, {
      sourceBinding: migration.sourceBinding,
    })
    const discoveryCancellation = await migrationCancellationHandle(
      migration,
      handlerContext,
      repository,
      now,
      ownership.data,
    )
    if (!discoveryCancellation.success) return discoveryCancellation
    if (discoveryCancellation.data) return { success: true, data: null }
    if (!discovered.success) return migrationFailurePersist(repository, migration, job, ownership.data, discovered)
    inventory = discovered.data
    const inventoryFingerprint = storageMigrationInventoryFingerprintCreate(inventory)
    if (migration.sourceInventoryFingerprint !== null && migration.sourceInventoryFingerprint !== inventoryFingerprint)
      return migrationFailurePersist(
        repository,
        migration,
        job,
        ownership.data,
        resultErrorCreate(op, "The source storage inventory changed during migration", undefined, {
          retryable: false,
        }),
      )
    if (migration.sourceInventoryFingerprint === null && migration.progress.copiedObjects > 0)
      return migrationFailurePersist(
        repository,
        migration,
        job,
        ownership.data,
        resultErrorCreate(op, "The source storage inventory snapshot is missing", undefined, { retryable: false }),
      )
    const totalBytes = inventory.reduce((total, item) => total + item.object.byteSize, 0)
    const discoveredProgress = repository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: migrationProgressPhaseRead(migration.progress.phase, "discovering"),
        totalObjects: Math.max(migration.progress.totalObjects, inventory.length),
        discoveredObjects: Math.max(migration.progress.discoveredObjects, inventory.length),
        totalBytes: Math.max(migration.progress.totalBytes, totalBytes),
        currentObjectKey: null,
      },
      { ownership: ownership.data, now: now(), sourceInventoryFingerprint: inventoryFingerprint },
    )
    if (!discoveredProgress.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, discoveredProgress)
    migration = discoveredProgress.data

    const copyingProgress = repository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: migrationProgressPhaseRead(migration.progress.phase, "copying"),
        currentObjectKey: null,
      },
      { ownership: ownership.data, now: now() },
    )
    if (!copyingProgress.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, copyingProgress)
    migration = copyingProgress.data

    for (const [index, item] of inventory.entries()) {
      const cancellation = await migrationCancellationHandle(migration, handlerContext, repository, now, ownership.data)
      if (!cancellation.success) return cancellation
      if (cancellation.data) return { success: true, data: null }

      const locations = storageMigrationObjectLocationCreate({
        sourceBinding: migration.sourceBinding,
        targetBinding: migration.targetBinding,
        namespace: item.namespace,
        key: item.key,
      })
      if (!locations.success) return migrationFailurePersist(repository, migration, job, ownership.data, locations)
      const copied = await storageMigrationObjectCopy(input.storage, {
        source: item,
        destination: locations.data.destination,
      })
      const copyCancellation = await migrationCancellationHandle(
        migration,
        handlerContext,
        repository,
        now,
        ownership.data,
      )
      if (!copyCancellation.success) return copyCancellation
      if (copyCancellation.data) return { success: true, data: null }
      if (!copied.success) return migrationFailurePersist(repository, migration, job, ownership.data, copied)
      const copiedObjects = Math.max(migration.progress.copiedObjects, index + 1)
      const copiedBytes = Math.max(
        migration.progress.copiedBytes,
        inventory.slice(0, index + 1).reduce((total, current) => total + current.object.byteSize, 0),
      )
      const progress = repository.storageMigrationProgressUpdate(
        migration.id,
        {
          ...migration.progress,
          phase: migrationProgressPhaseRead(migration.progress.phase, "copying"),
          copiedObjects,
          copiedBytes,
          currentObjectKey: item.location.objectKey,
        },
        { ownership: ownership.data, now: now() },
      )
      if (!progress.success) return migrationFailurePersist(repository, migration, job, ownership.data, progress)
      migration = progress.data
    }

    const verifyingProgress = repository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: migrationProgressPhaseRead(migration.progress.phase, "verifying"),
        currentObjectKey: null,
      },
      { ownership: ownership.data, now: now() },
    )
    if (!verifyingProgress.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, verifyingProgress)
    migration = verifyingProgress.data

    const verified = await storageMigrationDestinationInventoryVerify(input.storage, {
      sourceBinding: migration.sourceBinding,
      targetBinding: migration.targetBinding,
      inventory,
    })
    const verificationCancellation = await migrationCancellationHandle(
      migration,
      handlerContext,
      repository,
      now,
      ownership.data,
    )
    if (!verificationCancellation.success) return verificationCancellation
    if (verificationCancellation.data) return { success: true, data: null }
    if (!verified.success) return migrationFailurePersist(repository, migration, job, ownership.data, verified)
    if (verified.data.objectCount !== inventory.length)
      return migrationFailurePersist(
        repository,
        migration,
        job,
        ownership.data,
        resultErrorCreate(op, "Destination inventory count did not match the source inventory"),
      )
    const completedVerification = repository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: migrationProgressPhaseRead(migration.progress.phase, "verifying"),
        verifiedObjects: Math.max(migration.progress.verifiedObjects, inventory.length),
        currentObjectKey: null,
      },
      { ownership: ownership.data, now: now() },
    )
    if (!completedVerification.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, completedVerification)
    migration = completedVerification.data
  }

  const shouldVerifyPublicUrl =
    storageChanged || migration.targetBinding.publicBaseUrl !== migration.sourceBinding.publicBaseUrl
  if (shouldVerifyPublicUrl) {
    const verified = await (input.destinationPublicUrlVerifier ?? storageMigrationDestinationPublicUrlVerify)({
      storage: input.storage,
      sourceBinding: migration.sourceBinding,
      targetBinding: migration.targetBinding,
    })
    const publicUrlCancellation = await migrationCancellationHandle(
      migration,
      handlerContext,
      repository,
      now,
      ownership.data,
    )
    if (!publicUrlCancellation.success) return publicUrlCancellation
    if (publicUrlCancellation.data) return { success: true, data: null }
    if (!verified.success) return migrationFailurePersist(repository, migration, job, ownership.data, verified)
  }

  if (storageChanged) {
    const finalInventory = await storageMigrationSourceInventoryRead(input.storage, {
      sourceBinding: migration.sourceBinding,
    })
    const finalInventoryCancellation = await migrationCancellationHandle(
      migration,
      handlerContext,
      repository,
      now,
      ownership.data,
    )
    if (!finalInventoryCancellation.success) return finalInventoryCancellation
    if (finalInventoryCancellation.data) return { success: true, data: null }
    if (!finalInventory.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, finalInventory)
    const finalFingerprint = storageMigrationInventoryFingerprintCreate(finalInventory.data)
    if (migration.sourceInventoryFingerprint !== finalFingerprint)
      return migrationFailurePersist(
        repository,
        migration,
        job,
        ownership.data,
        resultErrorCreate(op, "The source storage inventory changed before cutover", undefined, { retryable: false }),
      )
  }

  if (!storageChanged) {
    const verifiedProgress = repository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: migrationProgressPhaseRead(migration.progress.phase, "verifying"),
        currentObjectKey: null,
      },
      { ownership: ownership.data, now: now() },
    )
    if (!verifiedProgress.success)
      return migrationFailurePersist(repository, migration, job, ownership.data, verifiedProgress)
    migration = verifiedProgress.data
  }

  const cancellation = await migrationCancellationHandle(migration, handlerContext, repository, now, ownership.data)
  if (!cancellation.success) return cancellation
  if (cancellation.data) return { success: true, data: null }
  const cuttingOver = repository.storageMigrationProgressUpdate(
    migration.id,
    {
      ...migration.progress,
      phase: migrationProgressPhaseRead(migration.progress.phase, "cutting_over"),
      currentObjectKey: null,
    },
    { ownership: ownership.data, now: now() },
  )
  if (!cuttingOver.success) return migrationFailurePersist(repository, migration, job, ownership.data, cuttingOver)

  const cutover = repository.storageMigrationCutover(migration.id, ownership.data, now())
  if (!cutover.success) return migrationFailurePersist(repository, cuttingOver.data, job, ownership.data, cutover)
  return { success: true, data: null }
}

function storageMigrationUnexpectedFailure(
  job: Parameters<JobHandler>[0],
  handlerContext: Parameters<JobHandler>[1],
  input: StorageMigrationWorkflowHandleInput,
  error: unknown,
): Result<null> {
  const op = "storageMigrationWorkflowHandle"
  if (handlerContext.isLeaseLost())
    return resultErrorCreate(op, "The storage migration job lease was lost", error, { retryable: true })
  const parsedPayload = v.safeParse(v.strictObject({ storageMigrationId: idSchema }), job.payload)
  const message = error instanceof Error ? error.message : String(error)
  if (!parsedPayload.success) return resultErrorCreate(op, message, error)
  const repository = storageMigrationRepositoryCreate(input.db, { clock: input.clock })
  const migration = repository.storageMigrationRead(parsedPayload.output.storageMigrationId)
  if (!migration.success) return migration
  if (migration.data === null || migration.data.status === "succeeded" || migration.data.status === "cancelled")
    return resultErrorCreate(op, message, error)
  const ownership = storageMigrationOwnershipRead(job, handlerContext)
  if (!ownership.success) return ownership
  const terminal = job.attempts > job.retryLimit
  const updated = repository.storageMigrationStatusUpdate(migration.data.id, terminal ? "failed" : "running", {
    ownership: ownership.data,
    lastError: message,
  })
  if (!updated.success) return updated
  return resultErrorCreate(op, message, error, { retryable: !terminal })
}

async function migrationCancellationHandle(
  migration: StorageMigration,
  handlerContext: Parameters<JobHandler>[1],
  repository: ReturnType<typeof storageMigrationRepositoryCreate>,
  clock: () => Date,
  ownership: StorageMigrationOwnership,
): Promise<Result<boolean>> {
  const current = repository.storageMigrationRead(migration.id)
  if (!current.success) return current
  if (current.data === null)
    return resultErrorCreate("migrationCancellationHandle", "The storage migration does not exist")
  if (current.data.status === "cancelled" || current.data.status === "succeeded" || current.data.status === "failed")
    return { success: true, data: true }
  if (handlerContext.isLeaseLost() || handlerContext.isCancelled())
    return resultErrorCreate("migrationCancellationHandle", "The storage migration job lease was lost", undefined, {
      retryable: true,
    })
  const owned = repository.storageMigrationOwnershipAssert(migration.id, ownership, clock())
  if (!owned.success) return owned
  return { success: true, data: false }
}

function migrationFailurePersist(
  repository: ReturnType<typeof storageMigrationRepositoryCreate>,
  migration: StorageMigration,
  job: Parameters<JobHandler>[0],
  ownership: StorageMigrationOwnership,
  failure: Result<unknown>,
): Result<never> {
  if (failure.success) return resultErrorCreate("storageMigrationWorkflowHandle", "The migration operation failed")
  const terminal = failure.retryable === false || job.attempts > job.retryLimit
  const updated = repository.storageMigrationStatusUpdate(migration.id, terminal ? "failed" : "running", {
    ownership,
    lastError: failure.errorMessage,
  })
  if (!updated.success) return updated
  return { ...failure, retryable: !terminal }
}

function storageMigrationOwnershipRead(
  job: Parameters<JobHandler>[0],
  handlerContext: Parameters<JobHandler>[1],
): Result<StorageMigrationOwnership> {
  if (job.leaseToken === null || job.leaseToken === undefined)
    return resultErrorCreate(
      "storageMigrationWorkflowHandle",
      "The storage migration job has no lease token",
      undefined,
      {
        retryable: true,
      },
    )
  return {
    success: true,
    data: { jobId: job.id, workerId: handlerContext.workerId, leaseToken: job.leaseToken },
  }
}

function migrationProgressPhaseRead(
  current: StorageMigration["progress"]["phase"],
  requested: StorageMigration["progress"]["phase"],
): StorageMigration["progress"]["phase"] {
  const phaseOrder: Record<StorageMigration["progress"]["phase"], number> = {
    discovering: 0,
    copying: 1,
    verifying: 2,
    cutting_over: 3,
    completed: 4,
  }
  return phaseOrder[current] >= phaseOrder[requested] ? current : requested
}
