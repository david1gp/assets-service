import { expect, test } from "bun:test"

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
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-17T00:00:00.000Z"

test("plan_outputs rejects an image with no required outputs", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-plan-output",
        name: "Plan output",
        slug: "plan-output",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-plan-output",
        organizationId: "org-plan-output",
        name: "Plan output",
        slug: "plan-output",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, environmentTable, {
        id: "environment-plan-output",
        projectId: "project-plan-output",
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "projects/project-plan-output",
        publicBaseUrl: "https://assets.example.test",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-plan-output",
          projectId: "project-plan-output",
          class: "image",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "empty.png",
          basename: "empty",
          currentSourceRevisionId: "source-plan-output",
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        const source = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-plan-output",
          assetId: "asset-plan-output",
          revision: 1,
          class: "image",
          originalFilename: "empty.png",
          mediaType: "image/png",
          byteSize: 4,
          sha256: "a".repeat(64),
          objectKey: "sources/source-plan-output/empty.png",
          createdAt: now,
        })
        if (!source.success) return source
        return { success: true, data: null }
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, workflowTable, {
        id: "workflow-plan-output",
        projectId: "project-plan-output",
        assetId: "asset-plan-output",
        kind: "asset_processing",
        status: "queued",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, jobTable, {
        id: "job-plan-output",
        workflowId: "workflow-plan-output",
        kind: "plan_outputs",
        status: "queued",
        availableAt: now,
        priority: 0,
        attempts: 0,
        retryLimit: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        idempotencyKey: "plan-output-job",
        payloadSchemaVersion: 1,
        payload: {
          assetId: "asset-plan-output",
          sourceRevisionId: "source-plan-output",
          environmentId: "environment-plan-output",
        },
        error: null,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)

    const registry = jobHandlerRegistryCreate()
    expect(
      assetWorkflowHandlersRegister(registry, {
        db: opened.data.db,
        storage: memoryStorageAdapterCreate(),
        backup: rcloneBackupAdapterFake(),
        clock: () => new Date(now),
      }).success,
    ).toBe(true)
    const engine = workflowEngineCreate({
      db: opened.data.db,
      workerId: "plan-output-worker",
      handlerRegistry: registry,
      retryBackoffMs: () => 0,
      clock: () => new Date(now),
    })
    expect((await engine.runOnce()).success).toBe(true)
    expect(opened.data.db.select().from(jobTable).get()?.status).toBe("retryable")
    expect(opened.data.db.select().from(jobTable).get()?.error?.message).toContain("requires at least one output")
  } finally {
    databaseClose(opened.data)
  }
})
