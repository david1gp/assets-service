import { describe, expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import type { AssetDatabase } from "../src/infrastructure/db/assetDatabase.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { uploadTable } from "../src/infrastructure/db/schema/uploadTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { storageMigrationRepositoryCreate } from "../src/migration/storageMigrationRepositoryCreate.js"
import { storageMutationAssert } from "../src/storage/storageMutationAssert.js"
import { uploadApiRepositoryCreate } from "../src/upload/uploadApiRepositoryCreate.js"

const now = "2026-09-01T00:00:00.000Z"

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

function migrationJobCreate(db: AssetDatabase, migrationId: string) {
  const ownership = {
    jobId: `job-${migrationId}`,
    workerId: "migration-worker",
    leaseToken: `lease-${migrationId}`,
  }
  const workflow = databaseRecordInsert(db, workflowTable, {
    id: `workflow-${migrationId}`,
    projectId: "project-1",
    assetId: null,
    kind: "storage_migration",
    status: "running",
    createdAt: now,
    updatedAt: now,
  })
  if (!workflow.success) throw new Error(workflow.errorMessage)
  const job = databaseRecordInsert(db, jobTable, {
    id: ownership.jobId,
    workflowId: workflow.data.id,
    kind: "migrate_storage",
    status: "running",
    availableAt: now,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: ownership.workerId,
    leaseToken: ownership.leaseToken,
    leaseExpiresAt: "2026-09-01T01:00:00.000Z",
    heartbeatAt: now,
    idempotencyKey: ownership.jobId,
    payloadSchemaVersion: 1,
    payload: { storageMigrationId: migrationId },
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  if (!job.success) throw new Error(job.errorMessage)
  return ownership
}

const fixtureCreate = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  for (const result of [
    databaseRecordInsert(opened.data.db, organizationTable, {
      id: "org-1",
      name: "Example",
      slug: "example",
      createdAt: now,
      updatedAt: now,
    }),
    databaseRecordInsert(opened.data.db, projectTable, {
      id: "project-1",
      organizationId: "org-1",
      name: "Example project",
      slug: "example-project",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    }),
    databaseRecordInsert(opened.data.db, environmentTable, {
      id: "environment-1",
      projectId: "project-1",
      name: "development",
      r2Bucket: sourceBinding.bucket,
      r2Prefix: sourceBinding.prefix,
      publicBaseUrl: sourceBinding.publicBaseUrl,
      createdAt: now,
      updatedAt: now,
    }),
  ]) {
    if (!result.success) throw new Error(result.errorMessage)
  }
  return {
    connection: opened.data,
    repository: storageMigrationRepositoryCreate(opened.data.db, { clock: () => new Date(now) }),
  }
}

describe("storage mutation admission", () => {
  test("reads active migrations through the supplied transaction", () => {
    const fixture = fixtureCreate()
    try {
      const result = databaseTransactionRun(fixture.connection.db, (transaction) => {
        const created = fixture.repository.storageMigrationCreate(
          {
            projectId: "project-1",
            environmentId: "environment-1",
            idempotencyKey: "migration-transaction-scope",
            sourceBinding,
            targetBinding,
          },
          transaction,
        )
        if (!created.success) return created
        return storageMutationAssert(fixture.repository, "environment-1", transaction)
      })
      expect(result).toMatchObject({
        success: false,
        op: "storageMutationAssert",
        retryable: true,
      })
      expect(storageMutationAssert(fixture.repository, "environment-1")).toEqual({ success: true, data: null })
    } finally {
      databaseClose(fixture.connection)
    }
  })

  test("blocks active migrations and releases the environment in every terminal state", () => {
    const fixture = fixtureCreate()
    try {
      for (const [index, status] of (["succeeded", "failed", "cancelled"] as const).entries()) {
        const created = fixture.repository.storageMigrationCreate({
          projectId: "project-1",
          environmentId: "environment-1",
          idempotencyKey: `migration-${index}`,
          sourceBinding,
          targetBinding,
        })
        expect(created.success).toBe(true)
        if (!created.success) return
        const ownership = migrationJobCreate(fixture.connection.db, created.data.id)

        expect(storageMutationAssert(fixture.repository, "environment-1")).toMatchObject({
          success: false,
          op: "storageMutationAssert",
          retryable: true,
        })
        expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership }).success).toBe(
          true,
        )
        expect(storageMutationAssert(fixture.repository, "environment-1")).toMatchObject({
          success: false,
          op: "storageMutationAssert",
        })
        expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, status, { ownership }).success).toBe(
          true,
        )
        expect(storageMutationAssert(fixture.repository, "environment-1")).toEqual({ success: true, data: null })
      }
    } finally {
      databaseClose(fixture.connection)
    }
  })

  test("rejects upload intent writes while active and admits them after completion", async () => {
    const fixture = fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-upload",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture.connection.db, created.data.id)

      const environment = fixture.connection.db.select().from(environmentTable).get()
      if (environment === undefined) return
      const repository = uploadApiRepositoryCreate(fixture.connection.db, memoryStorageAdapterCreate(), {
        now: () => new Date(now),
      })
      const input = {
        originalFilename: "upload.png",
        folders: [],
        integrationNote: "test upload",
        byteSize: 0,
        mediaType: "image/png",
      }
      expect(await repository.uploadIntentCreate("project-1", environment, input)).toMatchObject({
        success: false,
        op: "storageMutationAssert",
      })
      expect(fixture.connection.db.select().from(uploadTable).all()).toHaveLength(0)

      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership }).success).toBe(
        true,
      )
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "succeeded", { ownership }).success).toBe(
        true,
      )
      expect(await repository.uploadIntentCreate("project-1", environment, input)).toMatchObject({
        success: true,
        data: { uploadId: expect.any(String) },
      })
    } finally {
      databaseClose(fixture.connection)
    }
  })
})
