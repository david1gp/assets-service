import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core"
import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { deletionApiRepositoryCreate } from "../src/deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../src/infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { auditEventTable } from "../src/infrastructure/db/schema/auditEventTable.js"
import { backupReceiptTable } from "../src/infrastructure/db/schema/backupReceiptTable.js"
import { blobTable } from "../src/infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../src/infrastructure/db/schema/manifestTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storageStagingObjectKeyCreate } from "../src/storage/storageStagingObjectKeyCreate.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-17T00:00:00.000Z"
const imageMetadata = {
  kind: "image" as const,
  width: 1,
  height: 1,
  format: "png" as const,
  colorSpace: "srgb" as const,
  alpha: false,
  orientationApplied: true,
  frameCount: 1,
  animated: false,
  alt: null,
  aiProvenance: null,
}

const setup = async () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  if (!databaseMigrate(opened.data).success) throw new Error("database migration failed")
  const db = opened.data.db
  const insert = (table: AnySQLiteTable, values: Record<string, unknown>) => databaseRecordInsert(db, table, values)

  insert(organizationTable, { id: "org-delete", name: "Delete", slug: "delete", createdAt: now, updatedAt: now })
  insert(projectTable, {
    id: "project-delete",
    organizationId: "org-delete",
    name: "Delete",
    slug: "delete",
    defaultEnvironment: "development",
    createdAt: now,
    updatedAt: now,
  })
  insert(environmentTable, {
    id: "environment-delete",
    projectId: "project-delete",
    name: "development",
    r2Bucket: "assets-delete",
    r2Prefix: "projects/project-delete",
    publicBaseUrl: "https://assets.example.test",
    createdAt: now,
    updatedAt: now,
  })
  databaseTransactionRun(db, (transaction) => {
    const asset = databaseRecordInsert(transaction, assetTable, {
      id: "asset-delete",
      projectId: "project-delete",
      class: "image",
      folder1: "home",
      folder2: null,
      folder3: null,
      filename: "hero.png",
      basename: "hero",
      currentSourceRevisionId: "source-delete",
      integrationNote: "Delete me",
      createdAt: now,
      updatedAt: now,
    })
    if (!asset.success) return asset
    return databaseRecordInsert(transaction, sourceRevisionTable, {
      id: "source-delete",
      assetId: "asset-delete",
      revision: 1,
      class: "image",
      originalFilename: "hero.png",
      mediaType: "image/png",
      byteSize: 1,
      sha256: "a".repeat(64),
      objectKey: "sources/source-delete/hero.png",
      createdAt: now,
    })
  })
  insert(outputDefinitionTable, {
    id: "output-delete",
    assetId: "asset-delete",
    kind: "image",
    key: "default",
    width: 1,
    height: 1,
    format: "png",
    quality: null,
    showAiLabel: null,
    createdAt: now,
    updatedAt: now,
  })
  insert(outputVersionTable, {
    id: "version-delete",
    outputDefinitionId: "output-delete",
    assetId: "asset-delete",
    version: 1,
    byteSize: 1,
    sha256: "b".repeat(64),
    mediaType: "image/png",
    extension: "png",
    objectKey: "images/home/hero_default_v1.png",
    toolchainVersion: "test",
    width: 1,
    height: 1,
    current: true,
    createdAt: now,
  })
  insert(assetMetadataTable, {
    id: "metadata-delete",
    assetId: "asset-delete",
    sourceRevisionId: "source-delete",
    metadata: imageMetadata,
    createdAt: now,
    updatedAt: now,
  })
  insert(workflowTable, {
    id: "workflow-upload-delete",
    projectId: "project-delete",
    assetId: "asset-delete",
    kind: "asset_processing",
    status: "succeeded",
    createdAt: now,
    updatedAt: now,
  })
  insert(jobTable, {
    id: "job-backup-delete",
    workflowId: "workflow-upload-delete",
    kind: "backup_original",
    status: "succeeded",
    availableAt: now,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    idempotencyKey: "backup-delete",
    payloadSchemaVersion: 1,
    payload: { assetId: "asset-delete", sourceRevisionId: "source-delete" },
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  insert(backupReceiptTable, {
    id: "backup-delete",
    projectId: "project-delete",
    sourceRevisionId: "source-delete",
    jobId: "job-backup-delete",
    remotePath: "gdrive_beta:backups/delete/assets/delete/home/asset-delete/hero.png",
    byteSize: 1,
    sha256: "a".repeat(64),
    checkResult: "verified",
    completedAt: now,
  })
  insert(uploadTable, {
    id: "upload-delete",
    projectId: "project-delete",
    environmentId: "environment-delete",
    assetId: "asset-delete",
    sourceRevisionId: "source-delete",
    originalFilename: "hero.png",
    folder1: "home",
    folder2: null,
    folder3: null,
    integrationNote: "Delete me",
    stagingObjectKey: "projects/project-delete/private/staging/uploads/upload-delete",
    byteSize: 1,
    mediaType: "image/png",
    sha256: "a".repeat(64),
    status: "accepted",
    failureReason: null,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  insert(catalogGenerationTable, {
    id: "generation-delete",
    projectId: "project-delete",
    environment: "development",
    digest: "c".repeat(64),
    manifestObjectKey: "catalogs/development/old.json",
    rendererVersion: "assets-service.catalog.v1",
    createdAt: now,
  })
  insert(catalogOutputTable, {
    generationId: "generation-delete",
    assetId: "asset-delete",
    outputVersionId: "version-delete",
    class: "image",
    key: "default",
    property: "home_hero_default",
    path: "images/home/hero_default_v1.png",
    metadata: imageMetadata,
  })
  insert(catalogTable, {
    id: "catalog-project-delete-development",
    projectId: "project-delete",
    environment: "development",
    generationId: "generation-delete",
    schema: "assets.catalog.v1",
    digest: "c".repeat(64),
    rendererVersion: "assets-service.catalog.v1",
    generatedAt: now,
    updatedAt: now,
  })
  insert(manifestTable, {
    id: "manifest-generation-delete",
    projectId: "project-delete",
    assetId: null,
    catalogGenerationId: "generation-delete",
    kind: "catalog",
    schema: "assets.catalog.v1",
    objectKey: "catalogs/development/old.json",
    byteSize: 1,
    sha256: "c".repeat(64),
    createdAt: now,
  })
  for (const blob of [
    ["blob-source-delete", "private", "source", "sources/source-delete/hero.png"],
    ["blob-output-private-delete", "private", "output", "outputs/version-delete.png"],
    ["blob-output-public-delete", "public", "output", "images/home/hero_default_v1.png"],
    ["blob-staging-delete", "private", "staging", "uploads/upload-delete"],
    ["blob-manifest-delete", "private", "manifest", "catalogs/development/old.json"],
  ] as const) {
    insert(blobTable, {
      id: blob[0],
      projectId: "project-delete",
      assetId: "asset-delete",
      sourceRevisionId: blob[2] === "source" ? "source-delete" : null,
      outputVersionId: blob[2] === "output" ? "version-delete" : null,
      storage: blob[1],
      environment: "development",
      kind: blob[2],
      objectKey: blob[3],
      byteSize: 1,
      sha256: "a".repeat(64),
      mediaType: "image/png",
      createdAt: now,
    })
  }

  const environment = db.select().from(environmentTable).get()
  if (environment === undefined) throw new Error("environment missing")
  const binding = storageBindingResolve(environment)
  if (!binding.success) throw new Error(binding.errorMessage)
  const storageBase = memoryStorageAdapterCreate()
  const put = async (namespace: "private-staging" | "private-source" | "public-output", key: string) => {
    const location = storageObjectLocationCreate(binding.data, namespace, key)
    if (!location.success) throw new Error(location.errorMessage)
    await storageBase.putImmutable({ location: location.data, bytes: new Uint8Array([1]), mediaType: "image/png" })
  }
  await put("private-source", "sources/source-delete/hero.png")
  await put("private-source", "outputs/version-delete.png")
  await put("public-output", "images/home/hero_default_v1.png")
  const staging = storageStagingObjectKeyCreate(binding.data, "upload-delete")
  if (!staging.success) throw new Error(staging.errorMessage)
  await storageBase.putImmutable({ location: staging.data, bytes: new Uint8Array([1]), mediaType: "image/png" })
  await put("private-source", "catalogs/development/old.json")

  const backup = rcloneBackupAdapterFake({ completedAt: now })
  backup.objects.set("gdrive_beta:backups/delete/assets/delete/home/asset-delete/hero.png", {
    byteSize: 1,
    sha256: "a".repeat(64),
  })
  return { opened: opened.data, db, storageBase, backup, binding }
}

const runDeletion = async (
  fixture: Awaited<ReturnType<typeof setup>>,
  storage: StorageAdapter = fixture.storageBase,
) => {
  const requested = deletionApiRepositoryCreate(fixture.db).deletionRequestEnqueue(
    "project-delete",
    "asset-delete",
    "actor-delete",
  )
  expect(requested).toMatchObject({ success: true, data: { status: expect.any(String) } })
  const registry = jobHandlerRegistryCreate()
  const registered = assetWorkflowHandlersRegister(registry, {
    db: fixture.db,
    storage,
    backup: fixture.backup,
    backupDelete: fixture.backup.deleteObject,
    clock: () => new Date(),
  })
  expect(registered.success).toBe(true)
  const engine = workflowEngineCreate({
    db: fixture.db,
    workerId: "delete-worker",
    handlerRegistry: registry,
    retryBackoffMs: () => 0,
    clock: () => new Date(),
  })
  await engine.runOnce()
  return { engine, requested }
}

describe("complete asset deletion", () => {
  test("deletes every remote and relational record before preserving status and audit evidence", async () => {
    const fixture = await setup()
    try {
      await runDeletion(fixture)
      const backupDeleteCount = fixture.backup.invocations.length
      await runDeletion(fixture)
      expect(fixture.db.select().from(assetTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(sourceRevisionTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(outputVersionTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(blobTable).all()).toMatchObject([{ kind: "manifest", assetId: null }])
      expect(fixture.db.select().from(backupReceiptTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(catalogOutputTable).all()).toHaveLength(0)
      expect(fixture.db.select().from(manifestTable).all()).toHaveLength(1)
      expect(
        fixture.db
          .select()
          .from(auditEventTable)
          .all()
          .map((event) => event.action),
      ).toEqual(["asset.deletion_requested", "asset.deleted"])
      const state = deletionApiRepositoryCreate(fixture.db).deletionStateRead?.("project-delete", "asset-delete")
      expect(state).toMatchObject({ success: true, data: { status: "succeeded", pendingRemoteObjects: [] } })
      expect(fixture.backup.objects.size).toBe(0)
      expect(fixture.backup.invocations).toHaveLength(backupDeleteCount)
    } finally {
      databaseClose(fixture.opened)
    }
  })

  test("persists remote progress and resumes after a transient deletion failure", async () => {
    const fixture = await setup()
    let failed = false
    const deletionOrder: string[] = []
    const storage: StorageAdapter = {
      ...fixture.storageBase,
      deleteObject: async (location) => {
        deletionOrder.push(`${location.namespace}:${location.key}`)
        if (!failed && location.namespace === "private-source") {
          failed = true
          return { success: false, op: "testDelete", errorMessage: "temporary R2 failure" }
        }
        return fixture.storageBase.deleteObject(location)
      },
    }
    try {
      const first = await runDeletion(fixture, storage)
      const stateAfterFailure = deletionApiRepositoryCreate(fixture.db).deletionStateRead?.(
        "project-delete",
        "asset-delete",
      )
      expect(stateAfterFailure).toMatchObject({ success: true, data: { status: "retryable" } })
      if (!stateAfterFailure?.success || stateAfterFailure.data === null)
        throw new Error("Deletion state was not persisted")
      const pendingAfterFailure = stateAfterFailure.data.pendingRemoteObjects
      expect(pendingAfterFailure.length).toBeGreaterThan(0)
      await first.engine.runOnce()
      const stateAfterRetry = deletionApiRepositoryCreate(fixture.db).deletionStateRead?.(
        "project-delete",
        "asset-delete",
      )
      expect(stateAfterRetry).toMatchObject({ success: true, data: { status: "succeeded", pendingRemoteObjects: [] } })
      expect(fixture.db.select().from(assetTable).all()).toHaveLength(0)
      expect(deletionOrder[0]).toBe("public-output:images/home/hero_default_v1.png")
      expect(deletionOrder[1]).toBe("private-source:catalogs/development/old.json")
      expect(fixture.backup.invocations.at(-1)?.args[0]).toBe("deletefile")
    } finally {
      databaseClose(fixture.opened)
    }
  })

  test("rechecks the asset before finalizing a stale catalog replacement", async () => {
    const fixture = await setup()
    let changed = false
    const storage: StorageAdapter = {
      ...fixture.storageBase,
      headObject: async (location) => {
        if (!changed) {
          changed = true
          fixture.db
            .update(assetTable)
            .set({ updatedAt: "2026-08-17T00:00:01.000Z" })
            .where(eq(assetTable.id, "asset-delete"))
            .run()
        }
        return fixture.storageBase.headObject(location)
      },
    }
    try {
      const first = await runDeletion(fixture, storage)
      expect(
        deletionApiRepositoryCreate(fixture.db).deletionStateRead?.("project-delete", "asset-delete"),
      ).toMatchObject({
        success: true,
        data: { status: "retryable" },
      })
      expect(fixture.db.select().from(assetTable).all()).toHaveLength(1)
      await first.engine.runOnce()
      expect(
        deletionApiRepositoryCreate(fixture.db).deletionStateRead?.("project-delete", "asset-delete"),
      ).toMatchObject({
        success: true,
        data: { status: "succeeded" },
      })
      expect(fixture.db.select().from(assetTable).all()).toHaveLength(0)
    } finally {
      databaseClose(fixture.opened)
    }
  })
})
