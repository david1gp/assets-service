import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { assetApiRepositoryCreate } from "../src/asset/assetApiRepositoryCreate.js"
import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { backupReceiptTable } from "../src/infrastructure/db/schema/backupReceiptTable.js"
import { blobTable } from "../src/infrastructure/db/schema/blobTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-09-04T00:00:00.000Z"
const sourceBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAABlBMVEX/AAD///9BHTQRAAAAAWJLR0QB/wIt3gAAAAtJREFUCNdjYIAAAAAIAAEvIN0xAAAAAElFTkSuQmCC",
  ),
  (character) => character.charCodeAt(0),
)
const outputBytes = sourceBytes

test("reprocesses an existing asset into production and leaves the development catalog unchanged", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    const seeded = databaseTransactionRun(opened.data.db, (transaction) => {
      for (const [index, result] of [
        databaseRecordInsert(transaction, organizationTable, {
          id: "org-reprocess",
          name: "Reprocess",
          slug: "reprocess",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, projectTable, {
          id: "project-reprocess",
          organizationId: "org-reprocess",
          name: "Reprocess",
          slug: "reprocess",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, environmentTable, {
          id: "environment-reprocess-development",
          projectId: "project-reprocess",
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "project-reprocess",
          publicBaseUrl: "https://development.assets.example.test",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, environmentTable, {
          id: "environment-reprocess-production",
          projectId: "project-reprocess",
          name: "production",
          r2Bucket: "assets-production",
          r2Prefix: "project-reprocess",
          publicBaseUrl: "https://assets.example.test",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, assetTable, {
          id: "asset-reprocess",
          projectId: "project-reprocess",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.png",
          basename: "hero",
          currentSourceRevisionId: "source-reprocess",
          integrationNote: "Reprocess",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-reprocess",
          assetId: "asset-reprocess",
          revision: 1,
          class: "image",
          originalFilename: "hero.png",
          mediaType: "image/png",
          byteSize: sourceBytes.byteLength,
          sha256: contentSha256Create(sourceBytes),
          objectKey: "sources/source-reprocess/hero.png",
          createdAt: now,
        }),
        databaseRecordInsert(transaction, blobTable, {
          id: "blob-source-reprocess",
          projectId: "project-reprocess",
          assetId: "asset-reprocess",
          sourceRevisionId: "source-reprocess",
          outputVersionId: null,
          storage: "private",
          environment: "development",
          kind: "source",
          objectKey: "sources/source-reprocess/hero.png",
          byteSize: sourceBytes.byteLength,
          sha256: contentSha256Create(sourceBytes),
          mediaType: "image/png",
          createdAt: now,
        }),
        databaseRecordInsert(transaction, outputDefinitionTable, {
          id: "output-reprocess",
          assetId: "asset-reprocess",
          kind: "image",
          key: "default",
          width: 100,
          height: 50,
          format: "png",
          quality: 80,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, catalogGenerationTable, {
          id: "generation-reprocess-development",
          projectId: "project-reprocess",
          environment: "development",
          digest: "d".repeat(64),
          manifestObjectKey: "catalogs/development/old.json",
          rendererVersion: "test",
          createdAt: now,
        }),
        databaseRecordInsert(transaction, catalogTable, {
          id: "catalog-project-reprocess-development",
          projectId: "project-reprocess",
          environment: "development",
          generationId: "generation-reprocess-development",
          schema: "assets.catalog.v1",
          digest: "d".repeat(64),
          rendererVersion: "test",
          generatedAt: now,
          updatedAt: now,
        }),
      ].entries()) {
        if (!result.success)
          return { success: false, op: "assetReprocessTestSeed", errorMessage: `seed ${index}: ${result.errorMessage}` }
      }
      return { success: true, data: null } as const
    })
    expect(seeded.success).toBe(true)
    if (!seeded.success) throw new Error(seeded.errorMessage)

    const sourceEnvironment = opened.data.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.id, "environment-reprocess-development"))
      .get()
    expect(sourceEnvironment).toBeDefined()
    if (sourceEnvironment === undefined) return
    const sourceBinding = storageBindingResolve(sourceEnvironment)
    expect(sourceBinding.success).toBe(true)
    if (!sourceBinding.success) return
    const sourceLocation = storageObjectLocationCreate(
      sourceBinding.data,
      "private-source",
      "sources/source-reprocess/hero.png",
    )
    expect(sourceLocation.success).toBe(true)
    if (!sourceLocation.success) return

    const storage = memoryStorageAdapterCreate({ now: () => new Date(now) })
    expect(
      (await storage.putImmutable({ location: sourceLocation.data, bytes: sourceBytes, mediaType: "image/png" }))
        .success,
    ).toBe(true)

    const reprocessed = assetApiRepositoryCreate(opened.data.db).assetReprocess(
      "project-reprocess",
      "asset-reprocess",
      {
        environmentId: "environment-reprocess-production",
      },
    )
    expect(reprocessed).toMatchObject({
      success: true,
      data: { asset: { currentSourceRevisionId: "source-reprocess" } },
    })
    if (!reprocessed.success || reprocessed.data === null || reprocessed.data.workflowId === undefined) return
    const workflowId = reprocessed.data.workflowId
    expect(typeof workflowId).toBe("string")
    const reprocessJobs = opened.data.db.select().from(jobTable).where(eq(jobTable.workflowId, workflowId)).all()
    expect(
      reprocessJobs.every(
        (job) => (job.payload as { environmentId?: string }).environmentId === "environment-reprocess-production",
      ),
    ).toBe(true)

    const registry = jobHandlerRegistryCreate()
    expect(
      assetWorkflowHandlersRegister(registry, {
        db: opened.data.db,
        storage,
        backup: rcloneBackupAdapterFake({ completedAt: now }),
        clock: () => new Date(now),
        imageProcessor: async () => ({
          success: true,
          data: {
            bytes: outputBytes,
            metadata: {
              kind: "image",
              width: 100,
              height: 50,
              format: "png",
              colorSpace: "srgb",
              alpha: false,
              orientationApplied: true,
              frameCount: 1,
              animated: false,
              alt: null,
              aiProvenance: null,
            },
            provenance: {
              schemaVersion: "assets-service.processing.v1",
              toolchain: [{ name: "test-image", version: "1" }],
            },
          },
        }),
      }).success,
    ).toBe(true)
    const engine = workflowEngineCreate({
      db: opened.data.db,
      workerId: "reprocess-worker",
      handlerRegistry: registry,
      retryBackoffMs: () => 0,
      clock: () => new Date(),
    })
    for (let index = 0; index < 5; index += 1) expect((await engine.runOnce()).success).toBe(true)

    const completedJobs = opened.data.db.select().from(jobTable).where(eq(jobTable.workflowId, workflowId)).all()
    expect(completedJobs).toMatchObject([
      { kind: "verify_original", status: "succeeded" },
      { kind: "backup_original", status: "succeeded" },
      { kind: "plan_outputs", status: "succeeded" },
      { kind: "process_image_output", status: "succeeded" },
      { kind: "publish_asset", status: "succeeded" },
    ])
    expect(opened.data.db.select().from(sourceRevisionTable).all()).toHaveLength(1)
    expect(opened.data.db.select().from(assetTable).get()?.currentSourceRevisionId).toBe("source-reprocess")
    expect(opened.data.db.select().from(catalogTable).all()).toMatchObject([
      { environment: "development", generationId: "generation-reprocess-development" },
      { environment: "production" },
    ])
    expect(
      opened.data.db
        .select()
        .from(catalogOutputTable)
        .all()
        .every((output) => output.generationId !== "generation-reprocess-development"),
    ).toBe(true)
    expect(
      opened.data.db
        .select()
        .from(blobTable)
        .all()
        .filter((blob) => blob.kind === "output" || blob.kind === "manifest")
        .every((blob) => blob.environment === "production"),
    ).toBe(true)
    expect(
      opened.data.db
        .select()
        .from(catalogGenerationTable)
        .all()
        .find((generation) => generation.environment === "production"),
    ).toMatchObject({ projectId: "project-reprocess", environment: "production" })
  } finally {
    databaseClose(opened.data)
  }
})

test("reprocesses an asset whose verified backup receipt belongs to an earlier workflow", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    const seeded = databaseTransactionRun(opened.data.db, (transaction) => {
      for (const [index, result] of [
        databaseRecordInsert(transaction, organizationTable, {
          id: "org-rebackup",
          name: "Rebackup",
          slug: "rebackup",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, projectTable, {
          id: "project-rebackup",
          organizationId: "org-rebackup",
          name: "Rebackup",
          slug: "rebackup",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, environmentTable, {
          id: "environment-rebackup-development",
          projectId: "project-rebackup",
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "project-rebackup",
          publicBaseUrl: "https://development.assets.example.test",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, environmentTable, {
          id: "environment-rebackup-production",
          projectId: "project-rebackup",
          name: "production",
          r2Bucket: "assets-production",
          r2Prefix: "project-rebackup",
          publicBaseUrl: "https://assets.example.test",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, assetTable, {
          id: "asset-rebackup",
          projectId: "project-rebackup",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.png",
          basename: "hero",
          currentSourceRevisionId: "source-rebackup",
          integrationNote: "Rebackup",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-rebackup",
          assetId: "asset-rebackup",
          revision: 1,
          class: "image",
          originalFilename: "hero.png",
          mediaType: "image/png",
          byteSize: sourceBytes.byteLength,
          sha256: contentSha256Create(sourceBytes),
          objectKey: "sources/source-rebackup/hero.png",
          createdAt: now,
        }),
        databaseRecordInsert(transaction, blobTable, {
          id: "blob-source-rebackup",
          projectId: "project-rebackup",
          assetId: "asset-rebackup",
          sourceRevisionId: "source-rebackup",
          outputVersionId: null,
          storage: "private",
          environment: "development",
          kind: "source",
          objectKey: "sources/source-rebackup/hero.png",
          byteSize: sourceBytes.byteLength,
          sha256: contentSha256Create(sourceBytes),
          mediaType: "image/png",
          createdAt: now,
        }),
        databaseRecordInsert(transaction, outputDefinitionTable, {
          id: "output-rebackup",
          assetId: "asset-rebackup",
          kind: "image",
          key: "default",
          width: 100,
          height: 50,
          format: "png",
          quality: 80,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        }),
        // An earlier, already-succeeded development workflow that produced the verified backup.
        databaseRecordInsert(transaction, workflowTable, {
          id: "workflow-rebackup-earlier",
          projectId: "project-rebackup",
          assetId: "asset-rebackup",
          sourceRevisionId: "source-rebackup",
          kind: "asset_processing",
          status: "succeeded",
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, jobTable, {
          id: "job-rebackup-earlier-backup",
          workflowId: "workflow-rebackup-earlier",
          kind: "backup_original",
          status: "succeeded",
          availableAt: now,
          priority: 0,
          attempts: 1,
          retryLimit: 3,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          idempotencyKey: "job-rebackup-earlier-backup",
          payloadSchemaVersion: 1,
          payload: {
            assetId: "asset-rebackup",
            sourceRevisionId: "source-rebackup",
            environmentId: "environment-rebackup-development",
          },
          error: null,
          createdAt: now,
          updatedAt: now,
        }),
        databaseRecordInsert(transaction, backupReceiptTable, {
          id: "receipt-rebackup",
          projectId: "project-rebackup",
          sourceRevisionId: "source-rebackup",
          jobId: "job-rebackup-earlier-backup",
          remotePath: "gdrive_beta:backups/rebackup/assets/source-rebackup_hero.png",
          byteSize: sourceBytes.byteLength,
          sha256: contentSha256Create(sourceBytes),
          checkResult: "verified",
          completedAt: now,
        }),
      ].entries()) {
        if (!result.success)
          return { success: false, op: "assetRebackupTestSeed", errorMessage: `seed ${index}: ${result.errorMessage}` }
      }
      return { success: true, data: null } as const
    })
    expect(seeded.success).toBe(true)
    if (!seeded.success) throw new Error(seeded.errorMessage)

    const sourceEnvironment = opened.data.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.id, "environment-rebackup-development"))
      .get()
    expect(sourceEnvironment).toBeDefined()
    if (sourceEnvironment === undefined) return
    const sourceBinding = storageBindingResolve(sourceEnvironment)
    expect(sourceBinding.success).toBe(true)
    if (!sourceBinding.success) return
    const sourceLocation = storageObjectLocationCreate(
      sourceBinding.data,
      "private-source",
      "sources/source-rebackup/hero.png",
    )
    expect(sourceLocation.success).toBe(true)
    if (!sourceLocation.success) return

    const storage = memoryStorageAdapterCreate({ now: () => new Date(now) })
    expect(
      (await storage.putImmutable({ location: sourceLocation.data, bytes: sourceBytes, mediaType: "image/png" }))
        .success,
    ).toBe(true)

    const reprocessed = assetApiRepositoryCreate(opened.data.db).assetReprocess("project-rebackup", "asset-rebackup", {
      environmentId: "environment-rebackup-production",
    })
    expect(reprocessed).toMatchObject({ success: true })
    if (!reprocessed.success || reprocessed.data === null || reprocessed.data.workflowId === undefined) return
    const workflowId = reprocessed.data.workflowId

    const registry = jobHandlerRegistryCreate()
    expect(
      assetWorkflowHandlersRegister(registry, {
        db: opened.data.db,
        storage,
        backup: rcloneBackupAdapterFake({ completedAt: now }),
        clock: () => new Date(now),
        imageProcessor: async () => ({
          success: true,
          data: {
            bytes: outputBytes,
            metadata: {
              kind: "image",
              width: 100,
              height: 50,
              format: "png",
              colorSpace: "srgb",
              alpha: false,
              orientationApplied: true,
              frameCount: 1,
              animated: false,
              alt: null,
              aiProvenance: null,
            },
            provenance: {
              schemaVersion: "assets-service.processing.v1",
              toolchain: [{ name: "test-image", version: "1" }],
            },
          },
        }),
      }).success,
    ).toBe(true)
    const engine = workflowEngineCreate({
      db: opened.data.db,
      workerId: "rebackup-worker",
      handlerRegistry: registry,
      retryBackoffMs: () => 0,
      clock: () => new Date(),
    })
    for (let index = 0; index < 5; index += 1) expect((await engine.runOnce()).success).toBe(true)

    // backup_original is idempotent and reuses the earlier receipt, so publish_asset must
    // not require the receipt to originate from this workflow.
    const completedJobs = opened.data.db.select().from(jobTable).where(eq(jobTable.workflowId, workflowId)).all()
    expect(completedJobs).toMatchObject([
      { kind: "verify_original", status: "succeeded" },
      { kind: "backup_original", status: "succeeded" },
      { kind: "plan_outputs", status: "succeeded" },
      { kind: "process_image_output", status: "succeeded" },
      { kind: "publish_asset", status: "succeeded" },
    ])
    expect(opened.data.db.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()?.status).toBe(
      "succeeded",
    )
    expect(opened.data.db.select().from(backupReceiptTable).all()).toMatchObject([
      { id: "receipt-rebackup", jobId: "job-rebackup-earlier-backup" },
    ])
  } finally {
    databaseClose(opened.data)
  }
})
