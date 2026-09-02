import { expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { blobTable } from "../src/infrastructure/db/schema/blobTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { storageMigrationRepositoryCreate } from "../src/migration/storageMigrationRepositoryCreate.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"
import { uploadApiRepositoryCreate } from "../src/upload/uploadApiRepositoryCreate.js"
import { uploadIngestionComplete } from "../src/upload/uploadIngestionComplete.js"
import { uploadIssuedLocationCreate } from "../src/upload/uploadIssuedLocationCreate.js"

const initialNow = "2026-09-01T00:00:00.000Z"
const expiredNow = "2026-09-01T00:10:01.000Z"
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

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

type Fixture = Awaited<ReturnType<typeof fixtureCreate>>

async function fixtureCreate(databasePath = ":memory:") {
  if (databasePath !== ":memory:") await mkdir("data", { recursive: true })
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const clock = { value: new Date(initialNow) }
  const db = opened.data.db
  for (const result of [
    databaseRecordInsert(db, organizationTable, {
      id: "org-1",
      name: "Example",
      slug: "example",
      createdAt: initialNow,
      updatedAt: initialNow,
    }),
    databaseRecordInsert(db, projectTable, {
      id: sourceBinding.projectId,
      organizationId: "org-1",
      name: "Example project",
      slug: "example-project",
      defaultEnvironment: "development",
      createdAt: initialNow,
      updatedAt: initialNow,
    }),
    databaseRecordInsert(db, environmentTable, {
      id: sourceBinding.environmentId,
      projectId: sourceBinding.projectId,
      name: sourceBinding.environment,
      r2Bucket: sourceBinding.bucket,
      r2Prefix: sourceBinding.prefix,
      publicBaseUrl: sourceBinding.publicBaseUrl,
      createdAt: initialNow,
      updatedAt: initialNow,
    }),
  ]) {
    if (!result.success) throw new Error(result.errorMessage)
  }
  const storage = memoryStorageAdapterCreate({ now: () => clock.value })
  return {
    connection: opened.data,
    db,
    clock,
    storage,
    migrationRepository: storageMigrationRepositoryCreate(db, { clock: () => clock.value }),
    uploadRepository: uploadApiRepositoryCreate(db, storage, { now: () => clock.value }),
  }
}

async function fixtureDelete(fixture: Fixture) {
  const path = fixture.connection.databasePath
  databaseClose(fixture.connection)
  if (path !== ":memory:") {
    await rm(path, { force: true })
    await rm(`${path}-wal`, { force: true })
    await rm(`${path}-shm`, { force: true })
  }
}

function migrationJobCreate(fixture: Fixture, migrationId: string) {
  const ownership = {
    jobId: `job-${migrationId}`,
    workerId: "migration-worker",
    leaseToken: `lease-${migrationId}`,
  }
  const workflow = databaseRecordInsert(fixture.db, workflowTable, {
    id: `workflow-${migrationId}`,
    projectId: sourceBinding.projectId,
    assetId: null,
    kind: "storage_migration",
    status: "running",
    createdAt: initialNow,
    updatedAt: initialNow,
  })
  if (!workflow.success) throw new Error(workflow.errorMessage)
  const job = databaseRecordInsert(fixture.db, jobTable, {
    id: ownership.jobId,
    workflowId: workflow.data.id,
    kind: "migrate_storage",
    status: "running",
    availableAt: initialNow,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: ownership.workerId,
    leaseToken: ownership.leaseToken,
    leaseExpiresAt: "2026-09-01T01:00:00.000Z",
    heartbeatAt: initialNow,
    idempotencyKey: ownership.jobId,
    payloadSchemaVersion: 1,
    payload: { storageMigrationId: migrationId },
    error: null,
    createdAt: initialNow,
    updatedAt: initialNow,
  })
  if (!job.success) throw new Error(job.errorMessage)
  return ownership
}

function environmentRead(fixture: Fixture) {
  const environment = fixture.db.select().from(environmentTable).get()
  if (environment === undefined) throw new Error("Environment was not seeded")
  return environment
}

function uploadInput(uploadId: string) {
  return {
    uploadId,
    originalFilename: "upload.png",
    folders: [],
    integrationNote: "Safety test",
    byteSize: bytes.byteLength,
    mediaType: "image/png",
  }
}

function storageLocation(binding: typeof sourceBinding, namespace: "private-staging" | "private-source", key: string) {
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

async function migrationPrepare(fixture: Fixture, idempotencyKey: string) {
  const created = fixture.migrationRepository.storageMigrationCreate({
    projectId: sourceBinding.projectId,
    environmentId: sourceBinding.environmentId,
    idempotencyKey,
    sourceBinding,
    targetBinding,
  })
  if (!created.success) throw new Error(created.errorMessage)
  const ownership = migrationJobCreate(fixture, created.data.id)
  const running = fixture.migrationRepository.storageMigrationStatusUpdate(created.data.id, "running", {
    ownership,
    now: fixture.clock.value,
  })
  if (!running.success) throw new Error(running.errorMessage)
  return { migration: running.data, ownership }
}

test("persists an issued upload location and expiry across a database reopen", async () => {
  const databasePath = `data/upload-safety-reopen-${crypto.randomUUID()}.sqlite`
  const fixture = await fixtureCreate(databasePath)
  try {
    const environment = environmentRead(fixture)
    const issued = await fixture.uploadRepository.uploadIntentCreate(
      "project-1",
      environment,
      uploadInput("upload-reopen"),
    )
    expect(issued).toMatchObject({ success: true, data: { intent: { expiresAt: "2026-09-01T00:10:00.000Z" } } })
    expect(fixture.db.select().from(uploadTable).get()).toMatchObject({
      id: "upload-reopen",
      issuedBucket: sourceBinding.bucket,
      issuedObjectKey: "source-prefix/private/staging/uploads/upload-reopen",
      issuedExpiresAt: "2026-09-01T00:10:00.000Z",
    })
  } finally {
    databaseClose(fixture.connection)
  }

  const reopened = databaseOpen(databasePath)
  expect(reopened.success).toBe(true)
  if (!reopened.success) return
  try {
    expect(databaseMigrate(reopened.data)).toEqual({ success: true, data: null })
    expect(reopened.data.db.select().from(uploadTable).get()).toMatchObject({
      id: "upload-reopen",
      issuedBucket: sourceBinding.bucket,
      issuedObjectKey: "source-prefix/private/staging/uploads/upload-reopen",
      issuedExpiresAt: "2026-09-01T00:10:00.000Z",
    })
  } finally {
    databaseClose(reopened.data)
    await rm(databasePath, { force: true })
    await rm(`${databasePath}-wal`, { force: true })
    await rm(`${databasePath}-shm`, { force: true })
  }
})

test("serializes issuance and migration creation across two database connections", async () => {
  const databasePath = `data/upload-safety-race-${crypto.randomUUID()}.sqlite`
  const first = await fixtureCreate(databasePath)
  const secondConnection = databaseOpen(databasePath)
  expect(secondConnection.success).toBe(true)
  if (!secondConnection.success) {
    await fixtureDelete(first)
    return
  }
  const secondRepository = storageMigrationRepositoryCreate(secondConnection.data.db, {
    clock: () => first.clock.value,
  })
  let signingStarted!: () => void
  const started = new Promise<void>((resolve) => {
    signingStarted = resolve
  })
  let releaseSigning!: () => void
  const signingReleased = new Promise<void>((resolve) => {
    releaseSigning = resolve
  })
  const baseStorage = memoryStorageAdapterCreate({ now: () => first.clock.value })
  const delayedStorage: StorageAdapter = {
    ...baseStorage,
    createSignedUploadIntent: async (input) => {
      signingStarted()
      await signingReleased
      return baseStorage.createSignedUploadIntent(input)
    },
  }
  const delayedRepository = uploadApiRepositoryCreate(first.db, delayedStorage, { now: () => first.clock.value })
  try {
    const issuing = delayedRepository.uploadIntentCreate(
      "project-1",
      environmentRead(first),
      uploadInput("upload-race"),
    )
    await started
    const migrationWins = secondRepository.storageMigrationCreate({
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-race-wins",
      sourceBinding,
      targetBinding,
    })
    expect(migrationWins).toMatchObject({ success: true })
    releaseSigning()
    expect(await issuing).toMatchObject({ success: false, op: "storageMutationAssert" })
    expect(first.db.select().from(uploadTable).all()).toHaveLength(0)

    if (!migrationWins.success) return
    const migrationWinsOwnership = migrationJobCreate(
      { ...first, migrationRepository: secondRepository },
      migrationWins.data.id,
    )
    expect(
      secondRepository.storageMigrationStatusUpdate(migrationWins.data.id, "running", {
        ownership: migrationWinsOwnership,
      }).success,
    ).toBe(true)
    expect(
      secondRepository.storageMigrationStatusUpdate(migrationWins.data.id, "succeeded", {
        ownership: migrationWinsOwnership,
      }).success,
    ).toBe(true)
    const issued = await first.uploadRepository.uploadIntentCreate(
      "project-1",
      environmentRead(first),
      uploadInput("upload-race-wins"),
    )
    expect(issued).toMatchObject({ success: true })
    expect(
      secondRepository.storageMigrationCreate({
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-issuance-wins",
        sourceBinding,
        targetBinding,
      }),
    ).toMatchObject({ success: false, retryable: true, rawData: { code: "upload_intent_active" } })
  } finally {
    databaseClose(secondConnection.data)
    await fixtureDelete(first)
  }
})

test("allows migration after expiry and rejects an unexpired intent at final cutover", async () => {
  const fixture = await fixtureCreate()
  try {
    const environment = environmentRead(fixture)
    const issued = await fixture.uploadRepository.uploadIntentCreate(
      "project-1",
      environment,
      uploadInput("upload-cutover"),
    )
    expect(issued.success).toBe(true)
    expect(
      fixture.migrationRepository.storageMigrationCreate({
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        idempotencyKey: "migration-before-expiry",
        sourceBinding,
        targetBinding,
      }),
    ).toMatchObject({ success: false, retryable: true, rawData: { code: "upload_intent_active" } })

    fixture.clock.value = new Date(expiredNow)
    const prepared = await migrationPrepare(fixture, "migration-cutover")
    const migration = prepared.migration
    const ready = fixture.migrationRepository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: "verifying",
      },
      { ownership: prepared.ownership, now: fixture.clock.value, sourceInventoryFingerprint: "a".repeat(64) },
    )
    expect(ready.success).toBe(true)

    fixture.clock.value = new Date(initialNow)
    const blocked = fixture.migrationRepository.storageMigrationCutover(
      migration.id,
      prepared.ownership,
      fixture.clock.value,
    )
    expect(blocked).toMatchObject({ success: false, retryable: true, rawData: { code: "upload_intent_active" } })
    expect(environmentRead(fixture)).toMatchObject({ r2Bucket: sourceBinding.bucket, r2Prefix: sourceBinding.prefix })
  } finally {
    await fixtureDelete(fixture)
  }
})

test("rejects upload verification metadata when migration starts after the remote object is verified", async () => {
  const fixture = await fixtureCreate()
  try {
    const issued = await fixture.uploadRepository.uploadIntentCreate(
      "project-1",
      environmentRead(fixture),
      uploadInput("upload-verification-race"),
    )
    expect(issued.success).toBe(true)
    const upload = fixture.db.select().from(uploadTable).get()
    if (upload === undefined) return
    const location = storageLocation(sourceBinding, "private-staging", "uploads/upload-verification-race")
    expect((await storagePutImmutable(fixture.storage, { location, bytes, mediaType: "image/png" })).success).toBe(true)

    let verificationStarted!: () => void
    const started = new Promise<void>((resolve) => {
      verificationStarted = resolve
    })
    let releaseVerification!: () => void
    const verificationReleased = new Promise<void>((resolve) => {
      releaseVerification = resolve
    })
    let paused = false
    const storage: StorageAdapter = {
      ...fixture.storage,
      headObject: async (input) => {
        const result = await fixture.storage.headObject(input)
        if (!paused) {
          paused = true
          verificationStarted()
          await verificationReleased
        }
        return result
      },
    }
    const expiredClockRepository = storageMigrationRepositoryCreate(fixture.db, {
      clock: () => new Date(expiredNow),
    })
    const completing = uploadApiRepositoryCreate(fixture.db, storage, {
      now: () => fixture.clock.value,
    }).uploadCompletionComplete("project-1", upload.id, { sha256: contentSha256Create(bytes) })
    await started

    const migration = expiredClockRepository.storageMigrationCreate({
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-after-upload-verification",
      sourceBinding,
      targetBinding,
    })
    expect(migration).toMatchObject({ success: true })
    releaseVerification()

    expect(await completing).toMatchObject({
      success: false,
      op: "storageMutationAssert",
      retryable: true,
    })
    expect(fixture.db.select().from(uploadTable).get()).toMatchObject({ status: "pending", verifiedAt: null })
    expect(fixture.db.select().from(assetTable).all()).toHaveLength(0)
    expect(await fixture.storage.headObject(location)).toMatchObject({
      success: true,
      data: { byteSize: bytes.length },
    })
  } finally {
    await fixtureDelete(fixture)
  }
})

test("leaves only the copied upload object when migration starts after ingestion storage", async () => {
  const fixture = await fixtureCreate()
  try {
    const uploadId = "upload-ingestion-race"
    expect(
      databaseRecordInsert(fixture.db, uploadTable, {
        id: uploadId,
        projectId: sourceBinding.projectId,
        environmentId: sourceBinding.environmentId,
        assetId: null,
        sourceRevisionId: null,
        uploaderId: null,
        notificationEligible: false,
        originalFilename: "upload.png",
        folder1: null,
        folder2: null,
        folder3: null,
        integrationNote: "Safety test",
        stagingObjectKey: "source-prefix/private/staging/uploads/upload-ingestion-race",
        issuedBucket: null,
        issuedObjectKey: null,
        issuedExpiresAt: null,
        byteSize: bytes.length,
        mediaType: "image/png",
        sha256: contentSha256Create(bytes),
        status: "pending",
        failureReason: null,
        verifiedAt: null,
        createdAt: initialNow,
        updatedAt: initialNow,
      }).success,
    ).toBe(true)
    const stagingLocation = storageLocation(sourceBinding, "private-staging", `uploads/${uploadId}`)
    expect(
      (await storagePutImmutable(fixture.storage, { location: stagingLocation, bytes, mediaType: "image/png" }))
        .success,
    ).toBe(true)

    let copyStarted!: () => void
    const started = new Promise<void>((resolve) => {
      copyStarted = resolve
    })
    let releaseCopy!: () => void
    const copyReleased = new Promise<void>((resolve) => {
      releaseCopy = resolve
    })
    const storage: StorageAdapter = {
      ...fixture.storage,
      copyImmutable: async (input) => {
        const result = await fixture.storage.copyImmutable(input)
        copyStarted()
        await copyReleased
        return result
      },
    }
    const ingesting = uploadIngestionComplete(fixture.db, storage, { uploadId, now: initialNow })
    await started
    const migration = fixture.migrationRepository.storageMigrationCreate({
      projectId: sourceBinding.projectId,
      environmentId: sourceBinding.environmentId,
      idempotencyKey: "migration-after-upload-ingestion",
      sourceBinding,
      targetBinding,
    })
    expect(migration).toMatchObject({ success: true })
    releaseCopy()

    expect(await ingesting).toMatchObject({
      success: false,
      op: "storageMutationAssert",
      retryable: true,
    })
    const sourceLocation = storageLocation(sourceBinding, "private-source", `sources/source-${uploadId}/upload.png`)
    expect(await fixture.storage.headObject(sourceLocation)).toMatchObject({
      success: true,
      data: { byteSize: bytes.length },
    })
    expect(fixture.db.select().from(assetTable).all()).toHaveLength(0)
    expect(fixture.db.select().from(sourceRevisionTable).all()).toHaveLength(0)
    expect(fixture.db.select().from(blobTable).all()).toHaveLength(0)
    expect(fixture.db.select().from(workflowTable).all()).toHaveLength(0)
  } finally {
    await fixtureDelete(fixture)
  }
})

test("expires completion without reading storage and resumes against a migrated staging location", async () => {
  const fixture = await fixtureCreate()
  try {
    const environment = environmentRead(fixture)
    const issued = await fixture.uploadRepository.uploadIntentCreate(
      "project-1",
      environment,
      uploadInput("upload-migrated"),
    )
    expect(issued.success).toBe(true)
    const initialUpload = fixture.db.select().from(uploadTable).get()
    if (initialUpload === undefined) return
    const initialBinding = {
      projectId: sourceBinding.projectId,
      environment: sourceBinding.environment,
      bucket: sourceBinding.bucket,
      prefix: sourceBinding.prefix,
      publicBaseUrl: environment.publicBaseUrl,
    }
    const initialLocation = uploadIssuedLocationCreate(initialBinding, initialUpload)
    if (!initialLocation.success) throw new Error(initialLocation.errorMessage)
    expect(
      (await storagePutImmutable(fixture.storage, { location: initialLocation.data, bytes, mediaType: "image/png" }))
        .success,
    ).toBe(true)

    let headCalls = 0
    const expiryStorage: StorageAdapter = {
      ...fixture.storage,
      headObject: async (location) => {
        headCalls += 1
        return fixture.storage.headObject(location)
      },
    }
    fixture.clock.value = new Date(expiredNow)
    const expired = await uploadApiRepositoryCreate(fixture.db, expiryStorage, {
      now: () => fixture.clock.value,
    }).uploadCompletionComplete("project-1", "upload-migrated", { sha256: contentSha256Create(bytes) })
    expect(expired).toMatchObject({ success: false, errorMessage: "Upload intent has expired" })
    expect(headCalls).toBe(0)

    const prepared = await migrationPrepare(fixture, "migration-migrated")
    const migration = prepared.migration
    const targetLocation = storageLocation(targetBinding, "private-staging", "uploads/upload-migrated")
    expect(
      await fixture.storage.copyImmutable({
        source: initialLocation.data,
        destination: targetLocation,
        mediaType: "image/png",
      }),
    ).toMatchObject({ success: true })
    const ready = fixture.migrationRepository.storageMigrationProgressUpdate(
      migration.id,
      {
        ...migration.progress,
        phase: "verifying",
        totalObjects: 1,
        discoveredObjects: 1,
        copiedObjects: 1,
        verifiedObjects: 1,
        totalBytes: bytes.byteLength,
        copiedBytes: bytes.byteLength,
      },
      { ownership: prepared.ownership, now: fixture.clock.value, sourceInventoryFingerprint: "a".repeat(64) },
    )
    expect(ready.success).toBe(true)
    const cutover = fixture.migrationRepository.storageMigrationCutover(
      migration.id,
      prepared.ownership,
      fixture.clock.value,
    )
    expect(cutover).toMatchObject({ success: true, data: { status: "succeeded" } })
    expect(fixture.db.select().from(uploadTable).get()).toMatchObject({
      stagingObjectKey: targetLocation.objectKey,
      issuedBucket: targetBinding.bucket,
      issuedObjectKey: targetLocation.objectKey,
      issuedExpiresAt: "2026-09-01T00:10:00.000Z",
    })

    const resumed = await fixture.uploadRepository.uploadIntentCreate(
      "project-1",
      environmentRead(fixture),
      uploadInput("upload-migrated"),
    )
    expect(resumed).toMatchObject({ success: true, data: { intent: { key: targetLocation.objectKey } } })
    let signerCalls = 0
    const completionStorage: StorageAdapter = {
      ...fixture.storage,
      createSignedUploadIntent: async () => {
        signerCalls += 1
        return { success: false, op: "unexpectedSigner", errorMessage: "completion must not sign" }
      },
    }
    const completed = await uploadApiRepositoryCreate(fixture.db, completionStorage, {
      now: () => fixture.clock.value,
    }).uploadCompletionComplete("project-1", "upload-migrated", { sha256: contentSha256Create(bytes) })
    expect(completed).toMatchObject({ success: true, data: { status: "accepted", uploadId: "upload-migrated" } })
    expect(signerCalls).toBe(0)
    expect(await fixture.storage.headObject(targetLocation)).toMatchObject({
      success: true,
      data: { byteSize: bytes.byteLength },
    })
  } finally {
    await fixtureDelete(fixture)
  }
})
