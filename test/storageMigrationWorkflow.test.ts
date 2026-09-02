import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { mkdir, rm } from "node:fs/promises"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { storageMigrationRepositoryCreate } from "../src/migration/storageMigrationRepositoryCreate.js"
import { storageMigrationWorkflowEnqueue } from "../src/migration/storageMigrationWorkflowEnqueue.js"
import { storageMigrationWorkflowHandlersRegister } from "../src/migration/storageMigrationWorkflowHandlersRegister.js"
import { storageMutationAssert } from "../src/storage/storageMutationAssert.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"
import { workflowRepositoryCancel } from "../src/workflow/workflowRepositoryCancel.js"

const sourceBinding = {
  projectId: "project-1",
  environmentId: "environment-1",
  environment: "development" as const,
  bucket: "source-bucket",
  prefix: "source-prefix",
  publicBaseUrl: "https://source.example.test",
}

const targetBinding = {
  ...sourceBinding,
  bucket: "target-bucket",
  prefix: "target-prefix",
  publicBaseUrl: "https://target.example.test",
}

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

async function fixtureCreate(databasePath = ":memory:") {
  if (databasePath !== ":memory:") await mkdir("data", { recursive: true })
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const db = opened.data.db
  for (const result of [
    databaseRecordInsert(db, organizationTable, {
      id: "organization-1",
      name: "Example",
      slug: "example",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }),
    databaseRecordInsert(db, projectTable, {
      id: sourceBinding.projectId,
      organizationId: "organization-1",
      name: "Example",
      slug: "example",
      defaultEnvironment: "development",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }),
    databaseRecordInsert(db, environmentTable, {
      id: sourceBinding.environmentId,
      projectId: sourceBinding.projectId,
      name: sourceBinding.environment,
      r2Bucket: sourceBinding.bucket,
      r2Prefix: sourceBinding.prefix,
      publicBaseUrl: sourceBinding.publicBaseUrl,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }),
  ]) {
    if (!result.success) throw new Error(result.errorMessage)
  }
  return { databasePath, opened: opened.data, db, storage: memoryStorageAdapterCreate() }
}

async function fixtureDelete(fixture: Awaited<ReturnType<typeof fixtureCreate>>) {
  databaseClose(fixture.opened)
  if (fixture.databasePath !== ":memory:")
    await Promise.all(
      [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`].map((path) =>
        rm(path, { force: true }),
      ),
    )
}

async function sourceObjectPut(
  fixture: Awaited<ReturnType<typeof fixtureCreate>>,
  namespace: "private-source" | "public-output",
  key = namespace === "public-output" ? "images/hero_v1.png" : "source/item",
) {
  const location = storageObjectLocationCreate(
    {
      projectId: sourceBinding.projectId,
      environment: sourceBinding.environment,
      bucket: sourceBinding.bucket,
      prefix: sourceBinding.prefix,
      publicBaseUrl: sourceBinding.publicBaseUrl,
    },
    namespace,
    key,
  )
  if (!location.success) throw new Error(location.errorMessage)
  const stored = await storagePutImmutable(fixture.storage, { location: location.data, bytes, mediaType: "image/png" })
  if (!stored.success) throw new Error(stored.errorMessage)
}

async function runMigration(
  fixture: Awaited<ReturnType<typeof fixtureCreate>>,
  target = targetBinding,
  storage: StorageAdapter = fixture.storage,
  options: {
    retryLimit?: number
    destinationPublicUrlVerifier?: Parameters<
      typeof storageMigrationWorkflowHandlersRegister
    >[1]["destinationPublicUrlVerifier"]
  } = {},
) {
  const enqueued = storageMigrationWorkflowEnqueue(fixture.db, {
    projectId: sourceBinding.projectId,
    environmentId: sourceBinding.environmentId,
    idempotencyKey: "migration-1",
    sourceBinding,
    targetBinding: target,
    ...(options.retryLimit === undefined ? {} : { retryLimit: options.retryLimit }),
  })
  expect(enqueued).toMatchObject({ success: true })
  if (!enqueued.success) throw new Error(enqueued.errorMessage)

  const registry = jobHandlerRegistryCreate()
  const registered = storageMigrationWorkflowHandlersRegister(registry, {
    db: fixture.db,
    storage,
    destinationPublicUrlVerifier: options.destinationPublicUrlVerifier ?? (async () => ({ success: true, data: null })),
  })
  expect(registered).toMatchObject({ success: true })
  const engine = workflowEngineCreate({
    db: fixture.db,
    workerId: "migration-worker",
    handlerRegistry: registry,
    retryBackoffMs: () => 0,
  })
  const run = await engine.runOnce()
  return { enqueued: enqueued.data, run }
}

describe("storage migration workflow", () => {
  test("probes, copies, verifies, cuts over, and preserves the source", async () => {
    const fixture = await fixtureCreate()
    let deleteCalls = 0
    try {
      await sourceObjectPut(fixture, "private-source")
      await sourceObjectPut(fixture, "public-output")
      const storage: StorageAdapter = {
        ...fixture.storage,
        deleteObject: async (location) => {
          deleteCalls += 1
          return fixture.storage.deleteObject(location)
        },
      }
      const result = await runMigration(fixture, targetBinding, storage)
      expect(result.run).toMatchObject({ success: true, data: 1 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationRead(result.enqueued.migrationId),
      ).toMatchObject({
        success: true,
        data: { status: "succeeded", progress: { phase: "completed", copiedObjects: 2, verifiedObjects: 2 } },
      })
      expect(fixture.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: targetBinding.bucket,
        r2Prefix: targetBinding.prefix,
        publicBaseUrl: targetBinding.publicBaseUrl,
      })
      expect(deleteCalls).toBe(0)
      expect(
        await fixture.storage.readObject(storageObjectLocation(sourceBinding, "private-source", "source/item")),
      ).toMatchObject({
        success: true,
        data: bytes,
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("probes but does not copy a domain-only migration", async () => {
    const fixture = await fixtureCreate()
    let probes = 0
    let lists = 0
    let copies = 0
    let verifierCalls = 0
    try {
      const storage: StorageAdapter = {
        ...fixture.storage,
        probeCredentials: async (bucket) => {
          probes += 1
          return fixture.storage.probeCredentials(bucket)
        },
        listObjects: async (input) => {
          lists += 1
          return (
            fixture.storage.listObjects?.(input) ?? {
              success: true,
              data: { objects: [], nextContinuationToken: null },
            }
          )
        },
        copyImmutable: async (input) => {
          copies += 1
          return fixture.storage.copyImmutable(input)
        },
      }
      await runMigration(fixture, { ...sourceBinding, publicBaseUrl: targetBinding.publicBaseUrl }, storage, {
        destinationPublicUrlVerifier: async () => {
          verifierCalls += 1
          return { success: true, data: null }
        },
      })
      expect({ probes, lists, copies, verifierCalls }).toEqual({ probes: 1, lists: 0, copies: 0, verifierCalls: 1 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationReadActive(sourceBinding.environmentId),
      ).toEqual({
        success: true,
        data: null,
      })
      expect(fixture.db.select().from(environmentTable).get()?.publicBaseUrl).toBe(targetBinding.publicBaseUrl)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("does not cut over when destination public probe cleanup fails", async () => {
    const fixture = await fixtureCreate()
    try {
      const result = await runMigration(fixture, targetBinding, fixture.storage, {
        retryLimit: 0,
        destinationPublicUrlVerifier: async () => ({
          success: false,
          op: "storageMigrationDestinationPublicUrlVerify",
          errorMessage: "Destination public URL probe cleanup failed; settings were not changed",
          retryable: false,
        }),
      })
      expect(result.run).toEqual({ success: true, data: 1 })
      expect(fixture.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: sourceBinding.bucket,
        r2Prefix: sourceBinding.prefix,
        publicBaseUrl: sourceBinding.publicBaseUrl,
      })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationRead(result.enqueued.migrationId),
      ).toMatchObject({ success: true, data: { status: "failed" } })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("replays an idempotent request without running storage work twice", async () => {
    const fixture = await fixtureCreate()
    let probes = 0
    try {
      await sourceObjectPut(fixture, "private-source")
      const storage: StorageAdapter = {
        ...fixture.storage,
        probeCredentials: async (bucket) => {
          probes += 1
          return fixture.storage.probeCredentials(bucket)
        },
      }
      const first = await runMigration(fixture, targetBinding, storage)
      const second = storageMigrationWorkflowEnqueue(fixture.db, {
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-1",
        sourceBinding,
        targetBinding,
      })
      expect(second).toEqual({ success: true, data: first.enqueued })
      const registry = jobHandlerRegistryCreate()
      expect(
        storageMigrationWorkflowHandlersRegister(registry, {
          db: fixture.db,
          storage,
          destinationPublicUrlVerifier: async () => ({ success: true, data: null }),
        }),
      ).toMatchObject({ success: true })
      expect(
        await workflowEngineCreate({ db: fixture.db, workerId: "replay-worker", handlerRegistry: registry }).runOnce(),
      ).toEqual({
        success: true,
        data: 0,
      })
      expect(probes).toBe(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("rolls back the migration when workflow enqueue fails and releases the lock", async () => {
    const fixture = await fixtureCreate()
    const input = {
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-enqueue-failure",
      sourceBinding,
      targetBinding,
    }
    try {
      const failed = storageMigrationWorkflowEnqueue(fixture.db, input, {
        workflowEnqueue: () => ({ success: false, op: "testEnqueue", errorMessage: "enqueue failed" }),
      })
      expect(failed).toMatchObject({ success: false, errorMessage: "enqueue failed" })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(
        repository.storageMigrationReadByIdempotencyKey(sourceBinding.environmentId, input.idempotencyKey),
      ).toEqual({
        success: true,
        data: null,
      })
      expect(repository.storageMigrationReadActive(sourceBinding.environmentId)).toEqual({ success: true, data: null })
      expect(fixture.db.select().from(workflowTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(jobTable).all()).toHaveLength(0)

      const retried = storageMigrationWorkflowEnqueue(fixture.db, input)
      expect(retried).toMatchObject({ success: true })
      expect(fixture.db.select().from(workflowTable).all()).toHaveLength(1)
      expect(fixture.db.select().from(jobTable).all()).toHaveLength(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("repairs a partially persisted migration and deduplicates idempotent retries", async () => {
    const fixture = await fixtureCreate()
    const input = {
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-partial-persistence",
      sourceBinding,
      targetBinding,
    }
    try {
      const repository = storageMigrationRepositoryCreate(fixture.db)
      const persisted = repository.storageMigrationCreate(input)
      expect(persisted).toMatchObject({ success: true })

      const repaired = storageMigrationWorkflowEnqueue(fixture.db, input)
      const retried = storageMigrationWorkflowEnqueue(fixture.db, input)
      expect(repaired).toMatchObject({ success: true })
      expect(retried).toEqual(repaired)
      expect(fixture.db.select().from(workflowTable).all()).toHaveLength(1)
      expect(fixture.db.select().from(jobTable).all()).toHaveLength(1)
      expect(fixture.db.select().from(jobTable).get()?.status).toBe("queued")
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("deduplicates concurrent idempotent starts", async () => {
    const fixture = await fixtureCreate(`data/storage-migration-concurrent-${crypto.randomUUID()}.sqlite`)
    const secondConnection = databaseOpen(fixture.databasePath)
    if (!secondConnection.success) throw new Error(secondConnection.errorMessage)
    const input = {
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-concurrent",
      sourceBinding,
      targetBinding,
    }
    try {
      const starts = await Promise.all([
        Promise.resolve(storageMigrationWorkflowEnqueue(fixture.db, input)),
        Promise.resolve(storageMigrationWorkflowEnqueue(secondConnection.data.db, input)),
      ])
      expect(starts.every((start) => start.success)).toBe(true)
      expect(starts[0]).toEqual(starts[1])
      expect(fixture.db.select().from(workflowTable).all()).toHaveLength(1)
      expect(fixture.db.select().from(jobTable).all()).toHaveLength(1)
    } finally {
      databaseClose(secondConnection.data)
      await fixtureDelete(fixture)
    }
  })

  test("fails closed when source settings change before cutover", async () => {
    const fixture = await fixtureCreate()
    try {
      await sourceObjectPut(fixture, "private-source")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async (input) => {
          const copied = await fixture.storage.copyImmutable(input)
          fixture.db
            .update(environmentTable)
            .set({ publicBaseUrl: "https://conflict.example.test", updatedAt: "2026-09-01T00:00:01.000Z" })
            .where(eq(environmentTable.id, sourceBinding.environmentId))
            .run()
          return copied
        },
      }
      await runMigration(fixture, targetBinding, storage, { retryLimit: 0 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationReadActive(sourceBinding.environmentId),
      ).toEqual({
        success: true,
        data: null,
      })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationReadByIdempotencyKey(
          sourceBinding.environmentId,
          "migration-1",
        ),
      ).toMatchObject({
        success: true,
        data: { status: "failed", lastError: expect.stringContaining("source settings") },
      })
      expect(fixture.db.select().from(environmentTable).get()?.publicBaseUrl).toBe("https://conflict.example.test")
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("releases the lock after terminal copy failure and never deletes", async () => {
    const fixture = await fixtureCreate()
    let deleteCalls = 0
    try {
      await sourceObjectPut(fixture, "private-source")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async () => ({ success: false, op: "testCopy", errorMessage: "copy failed" }),
        deleteObject: async (location) => {
          deleteCalls += 1
          return fixture.storage.deleteObject(location)
        },
      }
      const first = await runMigration(fixture, targetBinding, storage, { retryLimit: 0 })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(repository.storageMigrationReadByIdempotencyKey(sourceBinding.environmentId, "migration-1")).toMatchObject(
        {
          success: true,
          data: { id: first.enqueued.migrationId, attempt: 1, status: "failed" },
        },
      )
      expect(storageMutationAssert(repository, sourceBinding.environmentId)).toEqual({ success: true, data: null })
      expect(deleteCalls).toBe(0)

      const retried = storageMigrationWorkflowEnqueue(fixture.db, {
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-1",
        sourceBinding,
        targetBinding,
      })
      expect(retried).toMatchObject({ success: true })
      if (!retried.success) return
      expect(retried.data.migrationId).not.toBe(first.enqueued.migrationId)
      expect(repository.storageMigrationRead(retried.data.migrationId)).toMatchObject({
        success: true,
        data: { attempt: 2, status: "queued" },
      })
      expect(fixture.db.select().from(workflowTable).all()).toHaveLength(2)
      expect(fixture.db.select().from(jobTable).all()).toHaveLength(2)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("releases the lock after terminal destination verification failure", async () => {
    const fixture = await fixtureCreate()
    let targetHeads = 0
    try {
      await sourceObjectPut(fixture, "public-output")
      const storage: StorageAdapter = {
        ...fixture.storage,
        headObject: async (location) => {
          const result = await fixture.storage.headObject(location)
          if (location.bucket === targetBinding.bucket && result.success && result.data !== null) {
            targetHeads += 1
            if (targetHeads >= 2) return { success: true, data: { ...result.data, sha256: "f".repeat(64) } }
          }
          return result
        },
      }
      await runMigration(fixture, targetBinding, storage, { retryLimit: 0 })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(repository.storageMigrationReadByIdempotencyKey(sourceBinding.environmentId, "migration-1")).toMatchObject(
        {
          success: true,
          data: { status: "failed" },
        },
      )
      expect(storageMutationAssert(repository, sourceBinding.environmentId)).toEqual({ success: true, data: null })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("cancels a queued migration and releases its lock without touching storage", async () => {
    const fixture = await fixtureCreate()
    try {
      const enqueued = storageMigrationWorkflowEnqueue(fixture.db, {
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-1",
        sourceBinding,
        targetBinding,
      })
      expect(enqueued).toMatchObject({ success: true })
      if (!enqueued.success) return
      expect(workflowRepositoryCancel(fixture.db, { workflowId: enqueued.data.workflowId })).toMatchObject({
        success: true,
        data: { status: "cancelled" },
      })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(repository.storageMigrationRead(enqueued.data.migrationId)).toMatchObject({
        success: true,
        data: { status: "cancelled" },
      })
      expect(storageMutationAssert(repository, sourceBinding.environmentId)).toEqual({ success: true, data: null })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("does not cancel or persist progress after a lease is replaced", async () => {
    const fixture = await fixtureCreate()
    let releaseCopy!: () => void
    const copyStarted = new Promise<void>((resolve) => {
      releaseCopy = resolve
    })
    let copyPaused!: () => void
    const paused = new Promise<void>((resolve) => {
      copyPaused = resolve
    })
    try {
      await sourceObjectPut(fixture, "private-source")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async (input) => {
          const copied = await fixture.storage.copyImmutable(input)
          copyPaused()
          await copyStarted
          return copied
        },
      }
      const enqueued = storageMigrationWorkflowEnqueue(fixture.db, {
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-lease-loss",
        sourceBinding,
        targetBinding,
        now: "2026-09-01T00:00:00.000Z",
      })
      expect(enqueued).toMatchObject({ success: true })
      if (!enqueued.success) return
      const registry = jobHandlerRegistryCreate()
      expect(
        storageMigrationWorkflowHandlersRegister(registry, {
          db: fixture.db,
          storage,
          clock: () => new Date("2026-09-01T00:00:00.000Z"),
          destinationPublicUrlVerifier: async () => ({ success: true, data: null }),
        }),
      ).toMatchObject({ success: true })
      const engine = workflowEngineCreate({
        db: fixture.db,
        workerId: "migration-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
        clock: () => new Date("2026-09-01T00:00:00.000Z"),
      })
      const executing = engine.runOnce()
      await paused
      const claimed = fixture.db.select().from(jobTable).get()
      expect(claimed?.leaseToken).toEqual(expect.any(String))
      fixture.db
        .update(jobTable)
        .set({
          leaseOwner: "replacement-worker:0",
          leaseToken: "replacement-lease",
          leaseExpiresAt: "2026-09-01T01:00:00.000Z",
          heartbeatAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        })
        .where(eq(jobTable.id, claimed?.id ?? "missing"))
        .run()
      releaseCopy()

      expect(await executing).toEqual({ success: true, data: 1 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationRead(enqueued.data.migrationId),
      ).toMatchObject({
        success: true,
        data: { status: "running", progress: { copiedObjects: 0 } },
      })
      expect(fixture.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: sourceBinding.bucket,
        r2Prefix: sourceBinding.prefix,
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("cancels from the workflow and releases the active migration lock", async () => {
    const fixture = await fixtureCreate()
    let releaseCopy!: () => void
    const copyStarted = new Promise<void>((resolve) => {
      releaseCopy = resolve
    })
    let copyPaused!: () => void
    const paused = new Promise<void>((resolve) => {
      copyPaused = resolve
    })
    try {
      await sourceObjectPut(fixture, "private-source")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async (input) => {
          const copied = await fixture.storage.copyImmutable(input)
          copyPaused()
          await copyStarted
          return copied
        },
      }
      const enqueued = storageMigrationWorkflowEnqueue(fixture.db, {
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-running-cancel",
        sourceBinding,
        targetBinding,
        now: "2026-09-01T00:00:00.000Z",
      })
      expect(enqueued).toMatchObject({ success: true })
      if (!enqueued.success) return
      const registry = jobHandlerRegistryCreate()
      expect(
        storageMigrationWorkflowHandlersRegister(registry, {
          db: fixture.db,
          storage,
          clock: () => new Date("2026-09-01T00:00:00.000Z"),
          destinationPublicUrlVerifier: async () => ({ success: true, data: null }),
        }),
      ).toMatchObject({ success: true })
      const executing = workflowEngineCreate({
        db: fixture.db,
        workerId: "migration-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
        clock: () => new Date("2026-09-01T00:00:00.000Z"),
      }).runOnce()
      await paused
      expect(workflowRepositoryCancel(fixture.db, { workflowId: enqueued.data.workflowId })).toMatchObject({
        success: true,
        data: { status: "cancelled" },
      })
      releaseCopy()

      expect(await executing).toEqual({ success: true, data: 1 })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(repository.storageMigrationRead(enqueued.data.migrationId)).toMatchObject({
        success: true,
        data: { status: "cancelled", progress: { copiedObjects: 0 } },
      })
      expect(repository.storageMigrationReadActive(sourceBinding.environmentId)).toEqual({ success: true, data: null })
      expect(storageMutationAssert(repository, sourceBinding.environmentId)).toEqual({ success: true, data: null })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("retries a transient copy failure without resetting persisted progress", async () => {
    const fixture = await fixtureCreate()
    let failedPublicCopy = false
    try {
      await sourceObjectPut(fixture, "private-source")
      await sourceObjectPut(fixture, "public-output")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async (input) => {
          if (!failedPublicCopy && input.source.objectKey.includes("/public/")) {
            failedPublicCopy = true
            return { success: false, op: "transientCopy", errorMessage: "temporary copy failure" }
          }
          return fixture.storage.copyImmutable(input)
        },
      }
      const first = await runMigration(fixture, targetBinding, storage, { retryLimit: 2 })
      expect(first.run).toEqual({ success: true, data: 1 })
      const repository = storageMigrationRepositoryCreate(fixture.db)
      expect(repository.storageMigrationRead(first.enqueued.migrationId)).toMatchObject({
        success: true,
        data: { status: "running", progress: { copiedObjects: 1, verifiedObjects: 0 } },
      })

      const registry = jobHandlerRegistryCreate()
      expect(
        storageMigrationWorkflowHandlersRegister(registry, {
          db: fixture.db,
          storage,
          destinationPublicUrlVerifier: async () => ({ success: true, data: null }),
        }),
      ).toMatchObject({ success: true })
      const replay = await workflowEngineCreate({
        db: fixture.db,
        workerId: "migration-retry-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
      }).runOnce()
      expect(replay).toEqual({ success: true, data: 1 })
      expect(repository.storageMigrationRead(first.enqueued.migrationId)).toMatchObject({
        success: true,
        data: { status: "succeeded", progress: { phase: "completed", copiedObjects: 2, verifiedObjects: 2 } },
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("fails a retry when the source inventory changes", async () => {
    const fixture = await fixtureCreate()
    let failedPublicCopy = false
    try {
      await sourceObjectPut(fixture, "private-source")
      await sourceObjectPut(fixture, "public-output")
      const storage: StorageAdapter = {
        ...fixture.storage,
        copyImmutable: async (input) => {
          if (!failedPublicCopy && input.source.objectKey.includes("/public/")) {
            failedPublicCopy = true
            return { success: false, op: "transientCopy", errorMessage: "temporary copy failure" }
          }
          return fixture.storage.copyImmutable(input)
        },
      }
      const first = await runMigration(fixture, targetBinding, storage, { retryLimit: 2 })
      expect(first.run).toEqual({ success: true, data: 1 })
      await sourceObjectPut(fixture, "private-source", "source/changed")

      const registry = jobHandlerRegistryCreate()
      expect(storageMigrationWorkflowHandlersRegister(registry, { db: fixture.db, storage })).toMatchObject({
        success: true,
      })
      const replay = await workflowEngineCreate({
        db: fixture.db,
        workerId: "migration-retry-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
      }).runOnce()
      expect(replay).toEqual({ success: true, data: 1 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationRead(first.enqueued.migrationId),
      ).toMatchObject({
        success: true,
        data: {
          status: "failed",
          progress: { copiedObjects: 1 },
          lastError: expect.stringContaining("source storage inventory changed"),
        },
      })
      expect(fixture.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: sourceBinding.bucket,
        r2Prefix: sourceBinding.prefix,
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("compares a fresh source inventory immediately before cutover", async () => {
    const fixture = await fixtureCreate()
    try {
      await sourceObjectPut(fixture, "private-source")
      const result = await runMigration(fixture, targetBinding, fixture.storage, {
        retryLimit: 0,
        destinationPublicUrlVerifier: async () => {
          await sourceObjectPut(fixture, "private-source", "source/changed-before-cutover")
          return { success: true, data: null }
        },
      })
      expect(result.run).toEqual({ success: true, data: 1 })
      expect(
        storageMigrationRepositoryCreate(fixture.db).storageMigrationRead(result.enqueued.migrationId),
      ).toMatchObject({
        success: true,
        data: {
          status: "failed",
          lastError: expect.stringContaining("source storage inventory changed before cutover"),
        },
      })
      expect(fixture.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: sourceBinding.bucket,
        r2Prefix: sourceBinding.prefix,
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })
})

function storageObjectLocation(
  binding: typeof sourceBinding,
  namespace: "private-source" | "public-output",
  key: string,
) {
  const location = storageObjectLocationCreate(
    {
      projectId: binding.projectId,
      environment: binding.environment,
      bucket: binding.bucket,
      prefix: binding.prefix,
      publicBaseUrl: binding.publicBaseUrl,
    },
    namespace,
    key,
  )
  if (!location.success) throw new Error(location.errorMessage)
  return location.data
}
