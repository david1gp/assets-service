import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as v from "valibot"

import { assetApiRepositoryCreate } from "../src/asset/assetApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../src/catalog/catalogApiRepositoryCreate.js"
import { deletionApiRepositoryCreate } from "../src/deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../src/infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { auditEventTable } from "../src/infrastructure/db/schema/auditEventTable.js"
import { catalogGenerationTable } from "../src/infrastructure/db/schema/catalogGenerationTable.js"
import { catalogOutputTable } from "../src/infrastructure/db/schema/catalogOutputTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { outputVersionSchema } from "../src/output/outputVersionSchema.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { uploadApiRepositoryCreate } from "../src/upload/uploadApiRepositoryCreate.js"
import { uploadIngestionComplete } from "../src/upload/uploadIngestionComplete.js"

const now = "2026-08-17T00:00:00.000Z"
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

const databaseCreate = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  expect(
    databaseRecordInsert(opened.data.db, organizationTable, {
      id: "org-1",
      name: "Example",
      slug: "example",
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  expect(
    databaseRecordInsert(opened.data.db, projectTable, {
      id: "project-1",
      organizationId: "org-1",
      name: "Example",
      slug: "example",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  expect(
    databaseRecordInsert(opened.data.db, environmentTable, {
      id: "environment-1",
      projectId: "project-1",
      name: "development",
      r2Bucket: "assets-development",
      r2Prefix: "project-1",
      publicBaseUrl: "https://assets.example.test",
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  const assetInserted = databaseTransactionRun(opened.data.db, (transaction) => {
    const asset = databaseRecordInsert(transaction, assetTable, {
      id: "asset-1",
      projectId: "project-1",
      class: "image",
      folder1: "home",
      folder2: null,
      folder3: null,
      filename: "hero.jpg",
      basename: "hero",
      currentSourceRevisionId: "source-1",
      integrationNote: "Hero",
      createdAt: now,
      updatedAt: now,
    })
    if (!asset.success) return asset
    return databaseRecordInsert(transaction, sourceRevisionTable, {
      id: "source-1",
      assetId: "asset-1",
      revision: 1,
      class: "image",
      originalFilename: "hero.jpg",
      mediaType: "image/jpeg",
      byteSize: 10,
      sha256: "a".repeat(64),
      objectKey: "sources/asset-1/hero.jpg",
      createdAt: now,
    })
  })
  if (!assetInserted.success) throw new Error(assetInserted.errorMessage)
  expect(
    databaseRecordInsert(opened.data.db, assetMetadataTable, {
      id: "metadata-1",
      assetId: "asset-1",
      sourceRevisionId: "source-1",
      metadata: {
        kind: "image",
        width: 100,
        height: 50,
        format: "jpg",
        colorSpace: "srgb",
        alpha: false,
        orientationApplied: true,
        frameCount: 1,
        animated: false,
        alt: null,
        aiProvenance: null,
      },
      createdAt: now,
      updatedAt: now,
    }).success,
  ).toBe(true)
  return opened.data
}

describe("asset API persistence", () => {
  test("retains output project ownership in the database while projecting public history versions", () => {
    const connection = databaseCreate()
    try {
      expect(
        databaseRecordInsert(connection.db, outputDefinitionTable, {
          id: "output-asset-1-default",
          assetId: "asset-1",
          kind: "image",
          key: "default",
          width: 100,
          height: 50,
          format: "webp",
          quality: null,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, outputVersionTable, {
          id: "version-asset-1-default",
          projectId: "project-1",
          outputDefinitionId: "output-asset-1-default",
          assetId: "asset-1",
          sourceRevisionId: "source-1",
          version: 1,
          byteSize: 100,
          sha256: "b".repeat(64),
          mediaType: "image/webp",
          extension: "webp",
          objectKey: "outputs/asset-1/default.webp",
          toolchainVersion: "test",
          width: 100,
          height: 50,
          current: true,
          createdAt: now,
        }).success,
      ).toBe(true)

      const repository = assetApiRepositoryCreate(connection.db)
      const list = repository.assetsRead("project-1")
      const detail = repository.assetRead("project-1", "asset-1")
      const stored = connection.db
        .select({ projectId: outputVersionTable.projectId })
        .from(outputVersionTable)
        .where(eq(outputVersionTable.id, "version-asset-1-default"))
        .get()

      expect(stored).toEqual({ projectId: "project-1" })
      expect(list).toMatchObject({
        success: true,
        data: [{ outputCount: 1 }],
      })
      expect(detail).toMatchObject({
        success: true,
        data: { outputHistory: [{ versions: [{ id: "version-asset-1-default" }] }] },
      })
      if (!detail.success || detail.data === null) return
      const version = detail.data.outputHistory[0]?.versions[0]
      expect(version).toBeDefined()
      expect(v.safeParse(outputVersionSchema, version).success).toBe(true)
      expect(version).not.toHaveProperty("projectId")
    } finally {
      databaseClose(connection)
    }
  })

  test("updates a stale canonical output in place while preserving custom output definitions", () => {
    const connection = databaseCreate()
    try {
      const managed = {
        id: "output-asset-1-default",
        assetId: "asset-1",
        kind: "image" as const,
        key: "default",
        width: 1280,
        height: 720,
        format: "webp" as const,
        quality: 60,
        showAiLabel: true,
        createdAt: "2026-08-16T00:00:00.000Z",
        updatedAt: "2026-08-16T00:00:00.000Z",
      }
      const custom = {
        id: "output-asset-1-mobile",
        assetId: "asset-1",
        kind: "image" as const,
        key: "mobile",
        width: 640,
        height: 360,
        format: "png" as const,
        quality: 70,
        showAiLabel: false,
        createdAt: "2026-08-16T00:00:00.000Z",
        updatedAt: "2026-08-16T00:00:00.000Z",
      }
      expect(databaseRecordInsert(connection.db, outputDefinitionTable, managed).success).toBe(true)
      expect(databaseRecordInsert(connection.db, outputDefinitionTable, custom).success).toBe(true)

      const repaired = assetApiRepositoryCreate(connection.db).assetOutputsSet("project-1", "asset-1", {
        outputs: [
          {
            kind: "image",
            key: "default",
            width: 1920,
            height: 1080,
            format: "avif",
            quality: 80,
          },
          {
            kind: "image",
            key: "mobile",
            width: 640,
            height: 360,
            format: "png",
            quality: 70,
            showAiLabel: false,
          },
        ],
      })
      expect(repaired.success).toBe(true)
      const rows = connection.db.select().from(outputDefinitionTable).all()
      expect(rows.find((row) => row.id === custom.id)).toEqual(custom)
      expect(rows.find((row) => row.id === managed.id)).toMatchObject({
        ...managed,
        width: 1920,
        height: 1080,
        format: "avif",
        quality: 80,
        showAiLabel: null,
        createdAt: managed.createdAt,
        updatedAt: expect.not.stringMatching(managed.updatedAt),
      })
    } finally {
      databaseClose(connection)
    }
  })

  test("scopes inventory, preserves history, enqueues output workflows, and makes mutations idempotent", () => {
    const connection = databaseCreate()
    try {
      const repository = assetApiRepositoryCreate(connection.db)
      expect(repository.assetsRead("project-1")).toMatchObject({
        success: true,
        data: [{ id: "asset-1", sourcePath: "home/hero.jpg", outputCount: 0 }],
      })
      expect(repository.assetsRead("other-project")).toEqual({ success: true, data: [] })
      expect(repository.assetRead("project-1", "asset-1")).toMatchObject({
        success: true,
        data: { sourceHistory: [{ id: "source-1" }], metadata: { metadata: { alt: null } } },
      })

      const output = { kind: "image" as const, key: "default", width: 100, height: 50, format: "webp" as const }
      const added = repository.assetOutputAdd("project-1", "asset-1", output)
      expect(added).toMatchObject({
        success: true,
        data: { workflowId: expect.any(String), asset: { outputHistory: [{ definition: { key: "default" } }] } },
      })
      const repeated = repository.assetOutputAdd("project-1", "asset-1", output)
      expect(repeated).toEqual(added)
      expect(connection.db.select().from(outputDefinitionTable).all()).toHaveLength(1)
      expect(connection.db.select().from(workflowTable).all()).toHaveLength(1)
      expect(connection.db.select().from(jobTable).all().length).toBeGreaterThan(0)

      const metadata = repository.assetMetadataSet("project-1", "asset-1", "")
      expect(metadata).toMatchObject({ success: true, data: { asset: { metadata: { metadata: { alt: "" } } } } })
      expect(repository.assetMetadataUnset("project-1", "asset-1", "alt")).toMatchObject({
        success: true,
        data: { asset: { metadata: { metadata: { alt: null } } } },
      })
      const workflowCountBeforeMove = connection.db.select().from(workflowTable).all().length
      expect(
        repository.assetMove("project-1", "asset-1", { folders: ["landing"], filename: "hero.jpg" }),
      ).toMatchObject({ success: true, data: { folders: ["landing"] } })
      expect(repository.assetRead("project-1", "asset-1")).toMatchObject({
        success: true,
        data: { sourcePath: "landing/hero.jpg" },
      })
      expect(connection.db.select().from(workflowTable).all()).toHaveLength(workflowCountBeforeMove + 1)
      expect(
        connection.db
          .select()
          .from(jobTable)
          .all()
          .some((job) => (job.payload as { values?: { forceNewVersion?: boolean } }).values?.forceNewVersion === true),
      ).toBe(true)
    } finally {
      databaseClose(connection)
    }
  })

  test("reprocesses an existing asset into its requested environment without changing its source revision", () => {
    const connection = databaseCreate()
    try {
      expect(
        databaseRecordInsert(connection.db, environmentTable, {
          id: "environment-production",
          projectId: "project-1",
          name: "production",
          r2Bucket: "assets-production",
          r2Prefix: "project-1",
          publicBaseUrl: "https://assets-production.example.test",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, projectTable, {
          id: "project-2",
          organizationId: "org-1",
          name: "Other",
          slug: "other",
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, environmentTable, {
          id: "environment-other",
          projectId: "project-2",
          name: "production",
          r2Bucket: "assets-other",
          r2Prefix: "project-2",
          publicBaseUrl: "https://other.example.test",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)

      const repository = assetApiRepositoryCreate(connection.db)
      const reprocessed = repository.assetReprocess("project-1", "asset-1", {
        environmentId: "environment-production",
      })
      expect(reprocessed).toMatchObject({
        success: true,
        data: {
          asset: { currentSourceRevisionId: "source-1" },
          workflowId: expect.any(String),
        },
      })
      expect(
        connection.db
          .select()
          .from(jobTable)
          .all()
          .every((job) => (job.payload as { environmentId?: string }).environmentId === "environment-production"),
      ).toBe(true)
      expect(connection.db.select().from(assetTable).get()?.currentSourceRevisionId).toBe("source-1")

      expect(repository.assetReprocess("project-1", "asset-1", { environmentId: "missing-environment" })).toMatchObject(
        {
          success: false,
          errorMessage: "The reprocess environment was not found",
        },
      )
      expect(repository.assetReprocess("project-1", "asset-1", { environmentId: "" })).toMatchObject({
        success: false,
        errorMessage: "The reprocess environment identifier was invalid",
      })
      expect(repository.assetReprocess("project-1", "asset-1", { environmentId: "environment-other" })).toMatchObject({
        success: false,
        errorMessage: "The reprocess environment must belong to the asset project",
      })
      expect(connection.db.select().from(workflowTable).all()).toHaveLength(1)
    } finally {
      databaseClose(connection)
    }
  })

  test("enqueues a project-scoped idempotent deletion request without executing it", () => {
    const connection = databaseCreate()
    try {
      const repository = deletionApiRepositoryCreate(connection.db)
      const first = repository.deletionRequestEnqueue("project-1", "asset-1")
      const second = repository.deletionRequestEnqueue("project-1", "asset-1")
      expect(first).toEqual({
        success: true,
        data: { deletionId: "deletion-asset-1", workflowId: "workflow-deletion-asset-1", status: "requested" },
      })
      expect(second).toEqual(first)
      expect(connection.db.select().from(workflowTable).all()).toMatchObject([{ kind: "deletion", status: "queued" }])
      expect(connection.db.select().from(jobTable).all()).toHaveLength(1)
      expect(
        deletionApiRepositoryCreate(connection.db).deletionRequestEnqueue("other-project", "asset-1").success,
      ).toBe(false)
    } finally {
      databaseClose(connection)
    }
  })

  test("creates missing asset metadata without mutating the current catalog output when setting alt", () => {
    const connection = databaseCreate()
    try {
      connection.db.delete(assetMetadataTable).where(eq(assetMetadataTable.assetId, "asset-1")).run()
      const output = databaseRecordInsert(connection.db, outputDefinitionTable, {
        id: "output-asset-1-default",
        assetId: "asset-1",
        kind: "image",
        key: "default",
        width: 320,
        height: 180,
        format: "webp",
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      })
      expect(output.success).toBe(true)
      const version = databaseRecordInsert(connection.db, outputVersionTable, {
        id: "version-asset-1-default",
        projectId: "project-1",
        outputDefinitionId: "output-asset-1-default",
        assetId: "asset-1",
        sourceRevisionId: "source-1",
        version: 1,
        byteSize: 100,
        sha256: "b".repeat(64),
        mediaType: "image/webp",
        extension: "webp",
        objectKey: "outputs/asset-1/default.webp",
        toolchainVersion: "test",
        width: 320,
        height: 180,
        current: true,
        createdAt: now,
      })
      expect(version.success).toBe(true)
      expect(
        databaseRecordInsert(connection.db, catalogGenerationTable, {
          id: "generation-asset-1",
          projectId: "project-1",
          environment: "development",
          digest: "c".repeat(64),
          manifestObjectKey: "catalogs/development/test.json",
          rendererVersion: "test",
          createdAt: now,
        }).success,
      ).toBe(true)
      const catalogMetadata = {
        kind: "image" as const,
        width: 320,
        height: 180,
        format: "webp" as const,
        colorSpace: "srgb" as const,
        alpha: false,
        orientationApplied: true,
        frameCount: 1,
        animated: false,
        alt: null,
        aiProvenance: null,
      }
      expect(
        databaseRecordInsert(connection.db, catalogOutputTable, {
          generationId: "generation-asset-1",
          assetId: "asset-1",
          outputVersionId: "version-asset-1-default",
          class: "image",
          key: "default",
          property: "home_hero",
          path: "images/home/hero.webp",
          metadata: catalogMetadata,
        }).success,
      ).toBe(true)
      expect(
        databaseRecordInsert(connection.db, catalogTable, {
          id: "catalog-project-1-development",
          projectId: "project-1",
          environment: "development",
          generationId: "generation-asset-1",
          schema: "assets.catalog.v1",
          digest: "c".repeat(64),
          rendererVersion: "test",
          generatedAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)

      const catalogRepository = catalogApiRepositoryCreate(connection.db)
      const listsBefore = catalogRepository.catalogListsRead("project-1", "development", {})
      expect(listsBefore).toMatchObject({
        success: true,
        data: { imageList: expect.stringContaining('"alt": null') },
      })
      const currentBefore = catalogRepository.catalogCurrentRead("project-1", "development")
      expect(currentBefore).toMatchObject({
        success: true,
        data: { catalog: { outputs: [{ metadata: catalogMetadata }] } },
      })

      const result = assetApiRepositoryCreate(connection.db).assetMetadataSet("project-1", "asset-1", "Catalog alt")
      expect(result).toMatchObject({
        success: true,
        data: { asset: { metadata: { metadata: { ...catalogMetadata, alt: "Catalog alt" } } } },
      })
      expect(connection.db.select().from(assetMetadataTable).all()).toMatchObject([
        {
          id: "metadata-asset-1",
          assetId: "asset-1",
          sourceRevisionId: "source-1",
          metadata: { ...catalogMetadata, alt: "Catalog alt" },
        },
      ])

      const lists = catalogRepository.catalogListsRead("project-1", "development", {})
      expect(lists).toMatchObject({
        success: true,
        data: { imageList: expect.stringContaining('"alt": "Catalog alt"') },
      })
      const historicalLists = catalogRepository.catalogListsRead("project-1", "development", {
        generationId: "generation-asset-1",
      })
      expect(historicalLists).toMatchObject({
        success: true,
        data: { imageList: expect.stringContaining('"alt": "Catalog alt"') },
      })
      const current = catalogRepository.catalogCurrentRead("project-1", "development")
      expect(current).toMatchObject({
        success: true,
        data: { catalog: { outputs: [{ metadata: { ...catalogMetadata, alt: "Catalog alt" } }] } },
      })
      const historical = catalogRepository.catalogRead("project-1", "generation-asset-1", "development")
      expect(historical).toMatchObject({
        success: true,
        data: { catalog: { outputs: [{ metadata: { ...catalogMetadata, alt: "Catalog alt" } }] } },
      })
      const history = catalogRepository.catalogsRead("project-1", "development", {})
      expect(history).toMatchObject({
        success: true,
        data: { items: [{ catalog: { outputs: [{ metadata: { ...catalogMetadata, alt: "Catalog alt" } }] } }] },
      })
    } finally {
      databaseClose(connection)
    }
  })

  test("keeps the unavailable metadata error when no row or catalog output exists", () => {
    const connection = databaseCreate()
    try {
      connection.db.delete(assetMetadataTable).where(eq(assetMetadataTable.assetId, "asset-1")).run()
      const result = assetApiRepositoryCreate(connection.db).assetMetadataSet("project-1", "asset-1", "Missing")
      expect(result).toMatchObject({
        success: false,
        op: "assetApiRepositoryMetadataSet",
        errorMessage: "Asset metadata is not available",
      })
      expect(connection.db.select().from(assetMetadataTable).all()).toHaveLength(0)
    } finally {
      databaseClose(connection)
    }
  })

  test("accepts an upload only after staging verification and keeps completion idempotent", async () => {
    const connection = databaseCreate()
    try {
      const storage = memoryStorageAdapterCreate({ now: () => new Date(now) })
      const repository = uploadApiRepositoryCreate(connection.db, storage, { now: () => new Date(now) })
      const environment = connection.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const intent = await repository.uploadIntentCreate(
        "project-1",
        {
          id: environment.id,
          projectId: environment.projectId,
          name: environment.name,
          r2Bucket: environment.r2Bucket,
          r2Prefix: environment.r2Prefix,
          publicBaseUrl: environment.publicBaseUrl,
          createdAt: environment.createdAt,
          updatedAt: environment.updatedAt,
        },
        {
          uploadId: "upload-1",
          originalFilename: "new.png",
          folders: ["new"],
          integrationNote: "New asset",
          byteSize: bytes.byteLength,
          mediaType: "image/png",
        },
        "actor-1",
      )
      expect(intent.success).toBe(true)
      if (!intent.success) return
      const binding = storageBindingResolve({
        id: environment.id,
        projectId: environment.projectId,
        name: environment.name,
        r2Bucket: environment.r2Bucket,
        r2Prefix: environment.r2Prefix,
        publicBaseUrl: environment.publicBaseUrl,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      })
      if (!binding.success) return
      const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-1")
      if (!staging.success) return
      await storage.putImmutable({ location: staging.data, bytes, mediaType: "image/png" })
      const checksum = contentSha256Create(bytes)
      const completed = await repository.uploadCompletionComplete("project-1", "upload-1", { sha256: checksum })
      const repeated = await repository.uploadCompletionComplete("project-1", "upload-1", { sha256: checksum })
      const ingestionRetry = await uploadIngestionComplete(connection.db, storage, { uploadId: "upload-1", now })
      const repeatedIngestionRetry = await uploadIngestionComplete(connection.db, storage, {
        uploadId: "upload-1",
        now,
      })
      expect(completed).toMatchObject({ success: true, data: { uploadId: "upload-1", status: "accepted" } })
      expect(repeated).toEqual(completed)
      expect(ingestionRetry).toMatchObject({
        success: true,
        data: { uploadId: "upload-1", assetId: "asset-upload-1", sourceRevisionId: "source-upload-1" },
      })
      expect(repeatedIngestionRetry).toEqual(ingestionRetry)
      expect(connection.db.select().from(auditEventTable).all()).toEqual([
        {
          id: "audit-asset-created-asset-upload-1",
          organizationId: "org-1",
          projectId: "project-1",
          actorId: "actor-1",
          action: "asset.created",
          resourceType: "asset",
          resourceId: "asset-upload-1",
          details: { uploadId: "upload-1" },
          createdAt: expect.any(String),
        },
      ])
      expect(connection.db.select().from(outputDefinitionTable).all()).toMatchObject([
        {
          id: "output-asset-upload-1-default",
          assetId: "asset-upload-1",
          kind: "image",
          key: "default",
          width: 1920,
          height: 1080,
          format: "avif",
          quality: 80,
          showAiLabel: null,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ])
      expect(connection.db.select().from(assetTable).all()).toHaveLength(2)
      expect(connection.db.select().from(auditEventTable).all()).toHaveLength(1)
    } finally {
      databaseClose(connection)
    }
  })

  test("rejects a conflicting deterministic asset creation audit event", async () => {
    const connection = databaseCreate()
    try {
      const storage = memoryStorageAdapterCreate({ now: () => new Date(now) })
      const repository = uploadApiRepositoryCreate(connection.db, storage, { now: () => new Date(now) })
      const environment = connection.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const environmentInput = {
        id: environment.id,
        projectId: environment.projectId,
        name: environment.name,
        r2Bucket: environment.r2Bucket,
        r2Prefix: environment.r2Prefix,
        publicBaseUrl: environment.publicBaseUrl,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      }
      const intent = await repository.uploadIntentCreate(
        "project-1",
        environmentInput,
        {
          uploadId: "upload-conflicting-audit",
          originalFilename: "new.png",
          folders: ["new"],
          integrationNote: "New asset",
          byteSize: bytes.byteLength,
          mediaType: "image/png",
        },
        "actor-1",
      )
      expect(intent.success).toBe(true)
      if (!intent.success) return

      const binding = storageBindingResolve(environmentInput)
      if (!binding.success) return
      const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-conflicting-audit")
      if (!staging.success) return
      expect((await storage.putImmutable({ location: staging.data, bytes, mediaType: "image/png" })).success).toBe(true)
      expect(
        databaseRecordInsert(connection.db, auditEventTable, {
          id: "audit-asset-created-asset-upload-conflicting-audit",
          organizationId: "org-1",
          projectId: "project-1",
          actorId: "different-actor",
          action: "asset.created",
          resourceType: "asset",
          resourceId: "asset-upload-conflicting-audit",
          details: { uploadId: "upload-conflicting-audit" },
          createdAt: now,
        }).success,
      ).toBe(true)

      const checksum = contentSha256Create(bytes)
      const result = await repository.uploadCompletionComplete("project-1", "upload-conflicting-audit", {
        sha256: checksum,
      })
      expect(result).toMatchObject({
        success: false,
        errorMessage: "The asset creation audit event did not match the upload",
      })
      expect(connection.db.select().from(assetTable).all()).toHaveLength(1)
    } finally {
      databaseClose(connection)
    }
  })

  test("persists an explicit upload target and creates a revision without moving the asset", async () => {
    const connection = databaseCreate()
    try {
      const storage = memoryStorageAdapterCreate({ now: () => new Date(now) })
      const repository = uploadApiRepositoryCreate(connection.db, storage, { now: () => new Date(now) })
      const environment = connection.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const environmentInput = {
        id: environment.id,
        projectId: environment.projectId,
        name: environment.name,
        r2Bucket: environment.r2Bucket,
        r2Prefix: environment.r2Prefix,
        publicBaseUrl: environment.publicBaseUrl,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      }
      const intent = await repository.uploadIntentCreate("project-1", environmentInput, {
        uploadId: "upload-replacement",
        assetId: "asset-1",
        originalFilename: "replacement.png",
        folders: ["replacement"],
        integrationNote: "Replacement",
        byteSize: bytes.byteLength,
        mediaType: "image/png",
      })
      expect(intent.success).toBe(true)
      expect(connection.db.select().from(uploadTable).get()).toMatchObject({
        id: "upload-replacement",
        assetId: "asset-1",
        uploaderId: null,
        notificationEligible: false,
      })
      if (!intent.success) return

      const binding = storageBindingResolve(environmentInput)
      if (!binding.success) return
      const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-replacement")
      if (!staging.success) return
      expect((await storage.putImmutable({ location: staging.data, bytes, mediaType: "image/png" })).success).toBe(true)

      const checksum = contentSha256Create(bytes)
      const completed = await repository.uploadCompletionComplete("project-1", "upload-replacement", {
        sha256: checksum,
      })
      expect(completed).toMatchObject({
        success: true,
        data: {
          assetId: "asset-1",
          sourceRevisionId: "source-upload-replacement",
          status: "accepted",
        },
      })
      expect(connection.db.select().from(assetTable).all()).toHaveLength(1)
      expect(connection.db.select().from(assetTable).get()).toMatchObject({
        id: "asset-1",
        folder1: "home",
        folder2: null,
        folder3: null,
        filename: "hero.jpg",
        currentSourceRevisionId: "source-upload-replacement",
      })
      expect(connection.db.select().from(sourceRevisionTable).all()).toMatchObject([
        { id: "source-1", assetId: "asset-1", revision: 1 },
        {
          id: "source-upload-replacement",
          assetId: "asset-1",
          revision: 2,
          originalFilename: "replacement.png",
          mediaType: "image/png",
          sha256: checksum,
        },
      ])
    } finally {
      databaseClose(connection)
    }
  })

  test("rejects nonexistent, cross-project, and class-incompatible upload targets", async () => {
    const connection = databaseCreate()
    try {
      const repository = uploadApiRepositoryCreate(connection.db, memoryStorageAdapterCreate(), {
        now: () => new Date(now),
      })
      const environment = connection.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const input = {
        originalFilename: "replacement.png",
        folders: ["home"],
        integrationNote: "Replacement",
        byteSize: bytes.byteLength,
        mediaType: "image/png",
      }
      const missing = await repository.uploadIntentCreate("project-1", environment, {
        ...input,
        assetId: "asset-missing",
      })
      const crossProject = await repository.uploadIntentCreate(
        "project-2",
        { ...environment, projectId: "project-2" },
        { ...input, assetId: "asset-1" },
      )
      const incompatible = await repository.uploadIntentCreate("project-1", environment, {
        ...input,
        assetId: "asset-1",
        originalFilename: "replacement.pdf",
        mediaType: "application/pdf",
      })

      expect(missing).toMatchObject({ success: false, errorMessage: "The upload target asset was not found" })
      expect(crossProject).toMatchObject({ success: false, errorMessage: "The upload target asset was not found" })
      expect(incompatible).toMatchObject({
        success: false,
        errorMessage: "The upload media type does not match the target asset class",
      })
      expect(connection.db.select().from(uploadTable).all()).toHaveLength(0)
    } finally {
      databaseClose(connection)
    }
  })
})
