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
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../src/infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { manifestTable } from "../src/infrastructure/db/schema/manifestTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outboxEventTable } from "../src/infrastructure/db/schema/outboxEventTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { uploadIngestionComplete } from "../src/upload/uploadIngestionComplete.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-17T00:00:00.000Z"
const staleAt = "2026-08-16T00:00:00.000Z"
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

      const storageBase = memoryStorageAdapterCreate()
      let publicationFailureInjected = false
      const storage: StorageAdapter = {
        ...storageBase,
        copyImmutable: async (copyInput) => {
          if (!publicationFailureInjected && copyInput.destination.namespace === "public-output") {
            publicationFailureInjected = true
            return { success: false, op: "testPublication", errorMessage: "publication temporarily unavailable" }
          }
          return storageBase.copyImmutable(copyInput)
        },
      }
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
            id: "output-asset-upload-asset-workflow-default",
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
      expect(opened.data.db.select().from(outputDefinitionTable).all()).toMatchObject([
        {
          id: "output-asset-upload-asset-workflow-default",
          width: 100,
          height: 50,
          format: "png",
          quality: null,
          showAiLabel: null,
        },
        {
          id: "output-asset-workflow-mobile",
          width: 50,
          height: 50,
          format: "png",
          quality: null,
          showAiLabel: null,
        },
      ])
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
      for (let index = 0; index < 8; index += 1) await restartedEngine.runOnce()

      expect(publicationFailureInjected).toBe(true)
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

  test("ingests an explicit replacement as a new revision without changing asset folders", async () => {
    const opened = databaseOpen(":memory:")
    expect(opened.success).toBe(true)
    if (!opened.success) return

    try {
      expect(databaseMigrate(opened.data).success).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, organizationTable, {
          id: "org-explicit-replacement",
          name: "Explicit replacement",
          slug: "explicit-replacement",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, projectTable, {
          id: "project-explicit-replacement",
          organizationId: "org-explicit-replacement",
          name: "Explicit replacement",
          slug: "explicit-replacement",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(opened.data.db, environmentTable, {
          id: "environment-explicit-replacement",
          projectId: "project-explicit-replacement",
          name: "development",
          r2Bucket: "assets-development",
          r2Prefix: "projects/project-explicit-replacement",
          publicBaseUrl: "https://assets.example.test",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseTransactionRun(opened.data.db, (transaction) => {
          const asset = databaseRecordInsert(transaction, assetTable, {
            id: "asset-explicit-replacement",
            projectId: "project-explicit-replacement",
            class: "image",
            folder1: "existing",
            folder2: "nested",
            folder3: null,
            filename: "hero.jpg",
            basename: "hero",
            currentSourceRevisionId: "source-explicit-replacement-1",
            integrationNote: "Hero",
            createdAt: now,
            updatedAt: now,
          })
          if (!asset.success) return asset
          const source = databaseRecordInsert(transaction, sourceRevisionTable, {
            id: "source-explicit-replacement-1",
            assetId: "asset-explicit-replacement",
            revision: 1,
            class: "image",
            originalFilename: "hero.jpg",
            mediaType: "image/jpeg",
            byteSize: 10,
            sha256: "a".repeat(64),
            objectKey: "sources/source-explicit-replacement-1/hero.jpg",
            createdAt: now,
          })
          if (!source.success) return source
          const managedOutput = databaseRecordInsert(transaction, outputDefinitionTable, {
            id: "output-asset-explicit-replacement-default",
            assetId: "asset-explicit-replacement",
            kind: "image",
            key: "default",
            width: 3840,
            height: 2160,
            format: "webp",
            quality: 60,
            showAiLabel: true,
            createdAt: staleAt,
            updatedAt: staleAt,
          })
          if (!managedOutput.success) return managedOutput
          const otherOutput = databaseRecordInsert(transaction, outputDefinitionTable, {
            id: "output-asset-explicit-replacement-mobile",
            assetId: "asset-explicit-replacement",
            kind: "image",
            key: "mobile",
            width: 640,
            height: 360,
            format: "jpg",
            quality: 70,
            showAiLabel: false,
            createdAt: now,
            updatedAt: now,
          })
          if (!otherOutput.success) return otherOutput
          return databaseRecordInsert(transaction, uploadTable, {
            id: "upload-explicit-replacement",
            projectId: "project-explicit-replacement",
            environmentId: "environment-explicit-replacement",
            assetId: "asset-explicit-replacement",
            sourceRevisionId: null,
            originalFilename: "replacement.png",
            folder1: "different",
            folder2: null,
            folder3: null,
            integrationNote: "Replacement",
            stagingObjectKey:
              "projects/project-explicit-replacement/private/staging/uploads/upload-explicit-replacement",
            byteSize: bytes.byteLength,
            mediaType: "image/png",
            sha256: contentSha256Create(bytes),
            status: "pending",
            failureReason: null,
            verifiedAt: null,
            createdAt: now,
            updatedAt: now,
          })
        }).success,
      ).toBe(true)

      const storage = memoryStorageAdapterCreate()
      const environment = opened.data.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const binding = storageBindingResolve(environment)
      expect(binding.success).toBe(true)
      if (!binding.success) return
      const staging = storageObjectLocationCreate(
        binding.data,
        "private-staging",
        "uploads/upload-explicit-replacement",
      )
      expect(staging.success).toBe(true)
      if (!staging.success) return
      expect((await storage.putImmutable({ location: staging.data, bytes, mediaType: "image/png" })).success).toBe(true)

      const ingestion = await uploadIngestionComplete(opened.data.db, storage, {
        uploadId: "upload-explicit-replacement",
        now,
      })

      expect(ingestion).toMatchObject({
        success: true,
        data: {
          assetId: "asset-explicit-replacement",
          sourceRevisionId: "source-upload-explicit-replacement",
        },
      })
      expect(opened.data.db.select().from(outputDefinitionTable).all()).toMatchObject([
        {
          id: "output-asset-explicit-replacement-default",
          width: 1920,
          height: 1080,
          format: "avif",
          quality: 80,
          showAiLabel: null,
          createdAt: staleAt,
          updatedAt: now,
        },
        {
          id: "output-asset-explicit-replacement-mobile",
          width: 640,
          height: 360,
          format: "jpg",
          quality: 70,
          showAiLabel: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      opened.data.db
        .update(outputDefinitionTable)
        .set({ width: 3840, height: 2160, format: "webp", quality: 60, showAiLabel: true, updatedAt: staleAt })
        .where(eq(outputDefinitionTable.id, "output-asset-explicit-replacement-default"))
        .run()
      const repeated = await uploadIngestionComplete(opened.data.db, storage, {
        uploadId: "upload-explicit-replacement",
        now,
      })
      expect(repeated).toEqual(ingestion)
      expect(opened.data.db.select().from(outputDefinitionTable).all()).toMatchObject([
        {
          id: "output-asset-explicit-replacement-default",
          width: 1920,
          height: 1080,
          format: "avif",
          quality: 80,
          showAiLabel: null,
          createdAt: staleAt,
          updatedAt: now,
        },
        {
          id: "output-asset-explicit-replacement-mobile",
          width: 640,
          height: 360,
          format: "jpg",
          quality: 70,
          showAiLabel: false,
          createdAt: now,
          updatedAt: now,
        },
      ])
      expect(opened.data.db.select().from(assetTable).all()).toMatchObject([
        {
          id: "asset-explicit-replacement",
          folder1: "existing",
          folder2: "nested",
          folder3: null,
          filename: "hero.jpg",
          currentSourceRevisionId: "source-upload-explicit-replacement",
        },
      ])
      expect(opened.data.db.select().from(sourceRevisionTable).all()).toMatchObject([
        { id: "source-explicit-replacement-1", assetId: "asset-explicit-replacement", revision: 1 },
        {
          id: "source-upload-explicit-replacement",
          assetId: "asset-explicit-replacement",
          revision: 2,
          originalFilename: "replacement.png",
        },
      ])
    } finally {
      databaseClose(opened.data)
    }
  })
})
