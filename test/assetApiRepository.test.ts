import { describe, expect, test } from "bun:test"

import { assetApiRepositoryCreate } from "../src/asset/assetApiRepositoryCreate.js"
import { deletionApiRepositoryCreate } from "../src/deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetMetadataTable } from "../src/infrastructure/db/schema/assetMetadataTable.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
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
import { uploadApiRepositoryCreate } from "../src/upload/uploadApiRepositoryCreate.js"

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
      expect(completed).toMatchObject({ success: true, data: { uploadId: "upload-1", status: "accepted" } })
      expect(repeated).toEqual(completed)
      expect(connection.db.select().from(assetTable).all()).toHaveLength(2)
    } finally {
      databaseClose(connection)
    }
  })
})
