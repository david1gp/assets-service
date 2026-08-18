import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { assetProcessingWorkflowEnqueue } from "../src/workflow/assetProcessingWorkflowEnqueue.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-18T00:00:00.000Z"

test("document workflows verify, publish changed bytes, and reuse identical bytes", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-document-workflow",
        name: "Document workflow",
        slug: "document-workflow",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-document-workflow",
        organizationId: "org-document-workflow",
        name: "Document workflow",
        slug: "document-workflow",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    const environment = databaseRecordInsert(opened.data.db, environmentTable, {
      id: "environment-document-workflow",
      projectId: "project-document-workflow",
      name: "development",
      r2Bucket: "assets-development",
      r2Prefix: "projects/project-document-workflow",
      publicBaseUrl: "https://assets.example.test",
      createdAt: now,
      updatedAt: now,
    })
    expect(environment.success).toBe(true)
    if (!environment.success) return

    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-document-workflow",
          projectId: "project-document-workflow",
          class: "document",
          folder1: "guides",
          folder2: null,
          folder3: null,
          filename: "guide.pdf",
          basename: "guide",
          currentSourceRevisionId: "source-document-workflow-1",
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        return databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-document-workflow-1",
          assetId: "asset-document-workflow",
          revision: 1,
          class: "document",
          originalFilename: "guide.pdf",
          mediaType: "application/pdf",
          byteSize: 6,
          sha256: contentSha256Create(new Uint8Array([1, 2, 3, 4, 5, 6])),
          objectKey: "sources/source-document-workflow-1/guide.pdf",
          createdAt: now,
        })
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, outputDefinitionTable, {
        id: "output-document-workflow",
        assetId: "asset-document-workflow",
        kind: "document",
        key: "default",
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)

    const storage = memoryStorageAdapterCreate()
    const binding = storageBindingResolve(environment.data)
    expect(binding.success).toBe(true)
    if (!binding.success) return

    const sourcePut = async (sourceId: string, bytes: Uint8Array) => {
      const location = storageObjectLocationCreate(binding.data, "private-source", `sources/${sourceId}/guide.pdf`)
      expect(location.success).toBe(true)
      if (!location.success) return false
      const stored = await storage.putImmutable({ location: location.data, bytes, mediaType: "application/pdf" })
      expect(stored.success).toBe(true)
      return stored.success
    }

    const firstBytes = new Uint8Array([1, 2, 3, 4, 5, 6])
    const secondBytes = new Uint8Array([1, 2, 3, 4, 5, 7])

    const registry = jobHandlerRegistryCreate()
    expect(
      assetWorkflowHandlersRegister(registry, {
        db: opened.data.db,
        storage,
        backup: rcloneBackupAdapterFake({ completedAt: now }),
        clock: () => new Date(now),
      }).success,
    ).toBe(true)
    const engine = workflowEngineCreate({
      db: opened.data.db,
      workerId: "document-workflow-worker",
      handlerRegistry: registry,
      retryBackoffMs: () => 0,
      clock: () => new Date(now),
    })

    const runWorkflow = async (workflowId: string, sourceId: string, bytes: Uint8Array) => {
      opened.data.db
        .update(assetTable)
        .set({ currentSourceRevisionId: sourceId, updatedAt: now })
        .where(eq(assetTable.id, "asset-document-workflow"))
        .run()
      const enqueued = assetProcessingWorkflowEnqueue(opened.data.db, {
        projectId: "project-document-workflow",
        assetId: "asset-document-workflow",
        workflowId,
        now,
      })
      expect(enqueued.success).toBe(true)
      if (!enqueued.success) return false
      if (!(await sourcePut(sourceId, bytes))) return false
      for (let index = 0; index < 5; index += 1) expect((await engine.runOnce()).success).toBe(true)
      expect(opened.data.db.select().from(workflowTable).where(eq(workflowTable.id, workflowId)).get()?.status).toBe(
        "succeeded",
      )
      return true
    }

    expect(
      opened.data.db.select().from(jobTable).where(eq(jobTable.workflowId, "missing-workflow")).all(),
    ).toHaveLength(0)
    const first = await runWorkflow("workflow-document-1", "source-document-workflow-1", firstBytes)
    expect(first).toBe(true)
    expect(
      opened.data.db
        .select()
        .from(jobTable)
        .all()
        .map((job) => job.kind),
    ).toContain("process_document_output")
    expect(opened.data.db.select().from(outputVersionTable).all()).toHaveLength(1)

    expect(
      databaseRecordInsert(opened.data.db, sourceRevisionTable, {
        id: "source-document-workflow-2",
        assetId: "asset-document-workflow",
        revision: 2,
        class: "document",
        originalFilename: "guide.pdf",
        mediaType: "application/pdf",
        byteSize: secondBytes.byteLength,
        sha256: contentSha256Create(secondBytes),
        objectKey: "sources/source-document-workflow-2/guide.pdf",
        createdAt: now,
      }).success,
    ).toBe(true)
    expect(await runWorkflow("workflow-document-2", "source-document-workflow-2", secondBytes)).toBe(true)
    expect(opened.data.db.select().from(outputVersionTable).all()).toHaveLength(2)

    const currentVersion = opened.data.db
      .select()
      .from(outputVersionTable)
      .where(eq(outputVersionTable.current, true))
      .get()
    expect(currentVersion?.version).toBe(2)
    if (currentVersion === undefined) return
    const publicLocation = storageObjectLocationCreate(binding.data, "public-output", currentVersion.objectKey)
    expect(publicLocation.success).toBe(true)
    if (!publicLocation.success) return
    const publicBytes = await storage.readObject(publicLocation.data)
    expect(publicBytes.success).toBe(true)
    if (!publicBytes.success || publicBytes.data === null) return
    expect(Buffer.from(publicBytes.data).equals(Buffer.from(secondBytes))).toBe(true)

    expect(
      databaseRecordInsert(opened.data.db, sourceRevisionTable, {
        id: "source-document-workflow-3",
        assetId: "asset-document-workflow",
        revision: 3,
        class: "document",
        originalFilename: "guide.pdf",
        mediaType: "application/pdf",
        byteSize: secondBytes.byteLength,
        sha256: contentSha256Create(secondBytes),
        objectKey: "sources/source-document-workflow-3/guide.pdf",
        createdAt: now,
      }).success,
    ).toBe(true)
    expect(await runWorkflow("workflow-document-3", "source-document-workflow-3", secondBytes)).toBe(true)
    expect(opened.data.db.select().from(outputVersionTable).all()).toHaveLength(3)
  } finally {
    databaseClose(opened.data)
  }
})
