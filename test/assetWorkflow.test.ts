import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import type { RcloneBackupAdapter } from "../src/backup/rcloneBackupAdapter.js"
import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { assetMetadataTable } from "../src/infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../src/infrastructure/db/schema/manifestTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outboxEventTable } from "../src/infrastructure/db/schema/outboxEventTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { uploadIngestionComplete } from "../src/upload/uploadIngestionComplete.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-17T00:00:00.000Z"
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

describe("asset ingestion workflow", () => {
  test("verifies, backs up, processes, publishes atomically, and survives duplicate completion", async () => {
    const opened = databaseOpen(":memory:")
    expect(opened.success).toBe(true)
    if (!opened.success) return

    let temporaryRoot = ""
    try {
      temporaryRoot = await mkdtemp(join(tmpdir(), "assets-service-workflow-"))
      expect(databaseMigrate(opened.data).success).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, organizationTable, {
          id: "org-asset-workflow",
          name: "Asset workflow",
          slug: "asset-workflow",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, projectTable, {
          id: "project-asset-workflow",
          organizationId: "org-asset-workflow",
          name: "Asset workflow",
          slug: "asset-workflow",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, environmentTable, {
          id: "environment-asset-workflow",
          projectId: "project-asset-workflow",
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "projects/project-asset-workflow",
          publicBaseUrl: "https://assets.example.test",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, uploadTable, {
          id: "upload-asset-workflow",
          projectId: "project-asset-workflow",
          environmentId: "environment-asset-workflow",
          assetId: null,
          sourceRevisionId: null,
          originalFilename: "hero.png",
          folder1: "home",
          folder2: null,
          folder3: null,
          integrationNote: "From the fixture",
          stagingObjectKey: "projects/project-asset-workflow/private/staging/uploads/upload-asset-workflow",
          byteSize: bytes.byteLength,
          mediaType: "image/png",
          sha256: contentSha256Create(bytes),
          status: "pending",
          failureReason: null,
          verifiedAt: null,
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)

      const storage = memoryStorageAdapterCreate()
      const environment = opened.data.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const binding = storageBindingResolve(environment)
      expect(binding.success).toBe(true)
      if (!binding.success) return
      const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-asset-workflow")
      expect(staging.success).toBe(true)
      if (!staging.success) return
      expect((await storage.putImmutable({ location: staging.data, bytes, mediaType: "image/png" })).success).toBe(true)

      const ingestion = await uploadIngestionComplete(opened.data.db, storage, {
        uploadId: "upload-asset-workflow",
        outputDefinitions: [
          {
            id: "output-asset-workflow",
            assetId: "asset-upload-asset-workflow",
            kind: "image",
            key: "default",
            width: 100,
            height: 50,
            format: "png",
            quality: null,
            showAiLabel: null,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "output-asset-workflow-mobile",
            assetId: "asset-upload-asset-workflow",
            kind: "image",
            key: "mobile",
            width: 50,
            height: 50,
            format: "png",
            quality: null,
            showAiLabel: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        temporaryDirectory: temporaryRoot,
        now,
      })
      expect(ingestion).toMatchObject({ success: true, data: { assetId: "asset-upload-asset-workflow" } })
      if (!ingestion.success) return
      const workspacePath = opened.data.db
        .select()
        .from(jobTable)
        .all()
        .map((job) =>
          job.kind === "cleanup_local_files" ? (job.payload as { values?: { workspacePath?: unknown } }) : null,
        )
        .find((payload): payload is { values?: { workspacePath?: unknown } } => payload !== null)?.values?.workspacePath
      if (typeof workspacePath !== "string") return
      await mkdir(workspacePath, { recursive: true })
      await Bun.write(join(workspacePath, "leftover.bin"), bytes)
      opened.data.db
        .delete(jobTable)
        .where(eq(jobTable.id, "workflow-upload-upload-asset-workflow-output-output-asset-workflow-mobile"))
        .run()
      expect(opened.data.db.select().from(assetTable).all()).toHaveLength(1)
      expect(opened.data.db.select().from(sourceRevisionTable).all()).toHaveLength(1)
      expect(opened.data.db.select().from(workflowTable).get()?.status).toBe("queued")

      const backupFake = rcloneBackupAdapterFake({ completedAt: now })
      let backupAllowed = false
      const backup: RcloneBackupAdapter = async (request, options) => {
        if (!backupAllowed) return { success: false, op: "testBackup", errorMessage: "backup temporarily unavailable" }
        return backupFake(request, options)
      }
      const registry = jobHandlerRegistryCreate()
      expect(
        assetWorkflowHandlersRegister(registry, {
          db: opened.data.db,
          storage,
          backup,
          temporaryDirectory: temporaryRoot,
          clock: () => new Date(now),
          imageProcessor: async () => ({
            success: true,
            data: {
              bytes,
              metadata: {
                kind: "image",
                width: 7,
                height: 3,
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
                toolchain: [{ name: "fake-image", version: "1" }],
              },
            },
          }),
        }).success,
      ).toBe(true)

      const engine = workflowEngineCreate({
        db: opened.data.db,
        workerId: "asset-test-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
        clock: () => new Date(now),
      })
      await engine.runOnce()
      await engine.runOnce()
      expect(
        opened.data.db
          .select()
          .from(jobTable)
          .all()
          .find((job) => job.kind === "backup_original")?.status,
      ).toBe("retryable")
      expect(
        opened.data.db
          .select()
          .from(jobTable)
          .all()
          .find((job) => job.kind === "plan_outputs")?.status,
      ).toBe("queued")

      backupAllowed = true
      const restartedEngine = workflowEngineCreate({
        db: opened.data.db,
        workerId: "asset-test-worker-restarted",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
        clock: () => new Date(now),
      })
      for (let index = 0; index < 7; index += 1) await restartedEngine.runOnce()

      expect(
        opened.data.db
          .select()
          .from(jobTable)
          .all()
          .map((job) => job.status),
      ).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
        "succeeded",
      ])
      expect(opened.data.db.select().from(workflowTable).get()?.status).toBe("succeeded")
      expect(opened.data.db.select().from(catalogTable).get()?.generationId).toContain("source-upload-asset-workflow")
      const manifest = opened.data.db.select().from(manifestTable).get()
      expect(opened.data.db.select().from(manifestTable).all()).toHaveLength(1)
      expect(manifest?.kind).toBe("catalog")
      if (manifest === undefined) return
      const manifestLocation = storageObjectLocationCreate(binding.data, "private-source", manifest.objectKey)
      expect(manifestLocation.success).toBe(true)
      if (!manifestLocation.success) return
      const manifestBytes = await storage.readObject(manifestLocation.data)
      expect(manifestBytes.success).toBe(true)
      if (!manifestBytes.success || manifestBytes.data === null) return
      expect(JSON.parse(new TextDecoder().decode(manifestBytes.data))).toMatchObject({
        schema: "assets.catalog.v1",
        projectId: "project-asset-workflow",
        outputs: expect.any(Array),
      })
      expect(opened.data.db.select().from(outboxEventTable).all()).toMatchObject([
        {
          eventId: "customer-asset-uploaded:upload-asset-workflow",
          kind: "customer_asset_uploaded",
          status: "pending",
        },
      ])
      expect(opened.data.db.select().from(assetMetadataTable).all()).toMatchObject([
        {
          id: "metadata-asset-upload-asset-workflow",
          assetId: "asset-upload-asset-workflow",
          sourceRevisionId: "source-upload-asset-workflow",
          metadata: {
            kind: "image",
            width: 7,
            height: 3,
            format: "png",
            colorSpace: "srgb",
            alpha: false,
            orientationApplied: true,
            frameCount: 1,
            animated: false,
            alt: null,
            aiProvenance: null,
          },
        },
      ])
      expect(await Bun.file(join(workspacePath, "leftover.bin")).exists()).toBe(false)
      expect(backupFake.invocations).toHaveLength(1)
      expect(opened.data.db.select().from(assetTable).all()).toHaveLength(1)

      const versionCount = opened.data.db.select().from(outputVersionTable).all().length
      const retriedOutput = opened.data.db
        .select()
        .from(jobTable)
        .all()
        .find((job) => job.kind === "process_image_output")
      if (retriedOutput === undefined) return
      opened.data.db
        .update(jobTable)
        .set({
          status: "retryable",
          availableAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          error: null,
          updatedAt: now,
        })
        .where(eq(jobTable.id, retriedOutput.id))
        .run()
      opened.data.db.update(workflowTable).set({ status: "running", updatedAt: now }).run()
      await restartedEngine.runOnce()
      expect(opened.data.db.select().from(outputVersionTable).all()).toHaveLength(versionCount)
      expect(
        opened.data.db
          .select()
          .from(jobTable)
          .all()
          .find((job) => job.id === retriedOutput.id)?.status,
      ).toBe("succeeded")

      for (const kind of ["notify_customer_upload", "cleanup_local_files"] as const) {
        opened.data.db
          .update(jobTable)
          .set({
            status: "retryable",
            availableAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            error: null,
            updatedAt: now,
          })
          .where(eq(jobTable.kind, kind))
          .run()
      }
      opened.data.db.update(workflowTable).set({ status: "running", updatedAt: now }).run()
      await restartedEngine.runOnce()
      await restartedEngine.runOnce()
      expect(opened.data.db.select().from(outboxEventTable).all()).toHaveLength(1)
      expect(
        opened.data.db
          .select()
          .from(jobTable)
          .all()
          .find((job) => job.kind === "cleanup_local_files")?.status,
      ).toBe("succeeded")

      const duplicate = await uploadIngestionComplete(opened.data.db, storage, {
        uploadId: "upload-asset-workflow",
        now,
      })
      expect(duplicate).toEqual(ingestion)
      expect(opened.data.db.select().from(jobTable).all()).toHaveLength(8)
    } finally {
      databaseClose(opened.data)
      if (temporaryRoot.length > 0) await rm(temporaryRoot, { force: true, recursive: true })
    }
  })
})
