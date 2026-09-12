import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectStorageDomainTable } from "../src/infrastructure/db/schema/projectStorageDomainTable.js"
import { projectStorageLocationTable } from "../src/infrastructure/db/schema/projectStorageLocationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { storageMigrationRepositoryCreate } from "../src/migration/storageMigrationRepositoryCreate.js"
import { storageMigrationTable } from "../src/migration/storageMigrationTable.js"

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

const migrationOwnership = (migrationId: string) => ({
  jobId: `job-${migrationId}`,
  workerId: "migration-worker",
  leaseToken: `lease-${migrationId}`,
})

async function fixtureCreate() {
  await mkdir("data", { recursive: true })
  const databasePath = `data/storage-migration-${crypto.randomUUID()}.sqlite`
  const opened = databaseOpen(databasePath)
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
    databasePath,
    connection: opened.data,
    repository: storageMigrationRepositoryCreate(opened.data.db, { clock: () => new Date(now) }),
  }
}

async function fixtureDelete(fixture: Awaited<ReturnType<typeof fixtureCreate>>): Promise<void> {
  databaseClose(fixture.connection)
  await Promise.all(
    [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`].map((path) =>
      rm(path, { force: true }),
    ),
  )
}

function migrationJobCreate(fixture: Awaited<ReturnType<typeof fixtureCreate>>, migrationId: string) {
  const ownership = migrationOwnership(migrationId)
  const workflowId = `workflow-${migrationId}`
  const workflow = databaseRecordInsert(fixture.connection.db, workflowTable, {
    id: workflowId,
    projectId: "project-1",
    assetId: null,
    kind: "storage_migration",
    status: "running",
    createdAt: now,
    updatedAt: now,
  })
  if (!workflow.success) throw new Error(workflow.errorMessage)
  const job = databaseRecordInsert(fixture.connection.db, jobTable, {
    id: ownership.jobId,
    workflowId,
    kind: "migrate_storage",
    status: "running",
    availableAt: now,
    priority: 0,
    attempts: 1,
    retryLimit: 3,
    leaseOwner: ownership.workerId,
    leaseToken: ownership.leaseToken,
    leaseExpiresAt: "2026-09-01T02:00:00.000Z",
    heartbeatAt: now,
    idempotencyKey: `job-${migrationId}`,
    payloadSchemaVersion: 1,
    payload: { storageMigrationId: migrationId },
    error: null,
    createdAt: now,
    updatedAt: now,
  })
  if (!job.success) throw new Error(job.errorMessage)
  return ownership
}

describe("storage migration repository", () => {
  test("persists binding snapshots and creates the same migration for repeated idempotent requests", async () => {
    const fixture = await fixtureCreate()
    try {
      const input = {
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-1",
        sourceBinding: { ...sourceBinding, customDomain: "source.example.test", zoneId: "zone-source" },
        targetBinding: { ...targetBinding, customDomain: "target.example.test", zoneId: "zone-target" },
      }
      const first = fixture.repository.storageMigrationCreate(input)
      const repeated = fixture.repository.storageMigrationCreate(input)

      expect(first).toMatchObject({ success: true, data: { status: "queued", sourceBinding, targetBinding } })
      expect(repeated).toMatchObject({ success: true })
      expect(fixture.connection.db.select().from(projectStorageLocationTable).all()).toMatchObject([
        { projectId: "project-1", environment: "development", bucket: "source-bucket", prefix: "source-prefix" },
        { projectId: "project-1", environment: "development", bucket: "target-bucket", prefix: "target-prefix" },
      ])
      expect(fixture.connection.db.select().from(projectStorageDomainTable).all()).toMatchObject([
        { projectId: "project-1", bucket: "source-bucket", customDomain: "source.example.test", zoneId: "zone-source" },
        { projectId: "project-1", bucket: "target-bucket", customDomain: "target.example.test", zoneId: "zone-target" },
      ])
      if (!first.success || !repeated.success) return
      expect(repeated.data.id).toBe(first.data.id)
      expect(
        fixture.repository.storageMigrationCreate({
          ...input,
          targetBinding: { ...targetBinding, prefix: "different-prefix" },
        }),
      ).toMatchObject({ success: false })
      expect(fixture.repository.storageMigrationReadByIdempotencyKey("environment-1", "migration-1")).toMatchObject({
        success: true,
        data: { id: first.data.id },
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("rejects a second active migration, then permits a new one after completion", async () => {
    const fixture = await fixtureCreate()
    try {
      const first = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-1",
        sourceBinding,
        targetBinding,
      })
      expect(first.success).toBe(true)
      const second = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-2",
        sourceBinding,
        targetBinding: { ...targetBinding, prefix: "another-prefix" },
      })
      expect(second.success).toBe(false)

      if (!first.success) return
      const ownership = migrationJobCreate(fixture, first.data.id)
      expect(fixture.repository.storageMigrationStatusUpdate(first.data.id, "running", { ownership })).toMatchObject({
        success: true,
        data: { status: "running" },
      })
      expect(fixture.repository.storageMigrationStatusUpdate(first.data.id, "succeeded", { ownership })).toMatchObject({
        success: true,
        data: { status: "succeeded", completedAt: now },
      })
      expect(
        fixture.repository.storageMigrationCreate({
          projectId: "project-1",
          environmentId: "environment-1",
          idempotencyKey: "migration-2",
          sourceBinding,
          targetBinding: { ...targetBinding, prefix: "another-prefix" },
        }),
      ).toMatchObject({ success: true, data: { status: "queued" } })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("updates and reads progress and status without losing the snapshots", async () => {
    const fixture = await fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-1",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)

      const progress = fixture.repository.storageMigrationProgressUpdate(
        created.data.id,
        {
          phase: "copying",
          totalObjects: 3,
          discoveredObjects: 3,
          copiedObjects: 1,
          verifiedObjects: 0,
          totalBytes: 30,
          copiedBytes: 10,
          currentObjectKey: "private/source/one.jpg",
        },
        { ownership },
      )
      expect(progress).toMatchObject({
        success: true,
        data: { progress: { copiedObjects: 1 }, sourceBinding, targetBinding },
      })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
        data: { status: "running", startedAt: now },
      })
      expect(fixture.repository.storageMigrationReadActive("environment-1")).toMatchObject({
        success: true,
        data: { id: created.data.id, status: "running" },
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("reuses succeeded attempts and creates durable retries for failed and cancelled attempts", async () => {
    const fixture = await fixtureCreate()
    try {
      for (const terminalStatus of ["failed", "cancelled"] as const) {
        const input = {
          projectId: "project-1",
          environmentId: "environment-1",
          idempotencyKey: `migration-${terminalStatus}-retry`,
          sourceBinding,
          targetBinding,
        }
        const created = fixture.repository.storageMigrationCreate(input)
        expect(created).toMatchObject({ success: true, data: { attempt: 1, status: "queued" } })
        if (!created.success) return
        const ownership = migrationJobCreate(fixture, created.data.id)
        expect(
          fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership }),
        ).toMatchObject({
          success: true,
        })
        expect(
          fixture.repository.storageMigrationStatusUpdate(created.data.id, terminalStatus, { ownership }),
        ).toMatchObject({ success: true, data: { attempt: 1, status: terminalStatus } })

        const retry = fixture.repository.storageMigrationCreate(input)
        expect(retry).toMatchObject({ success: true, data: { attempt: 2, status: "queued" } })
        if (!retry.success) return
        expect(retry.data.id).not.toBe(created.data.id)
        expect(fixture.repository.storageMigrationCreate(input)).toMatchObject({
          success: true,
          data: { id: retry.data.id, attempt: 2, status: "queued" },
        })
        expect(fixture.repository.storageMigrationRead(created.data.id)).toMatchObject({
          success: true,
          data: { status: terminalStatus, attempt: 1 },
        })
        const retryOwnership = migrationJobCreate(fixture, retry.data.id)
        expect(
          fixture.repository.storageMigrationStatusUpdate(retry.data.id, "running", { ownership: retryOwnership }),
        ).toMatchObject({ success: true })
        expect(
          fixture.repository.storageMigrationStatusUpdate(retry.data.id, terminalStatus, { ownership: retryOwnership }),
        ).toMatchObject({ success: true })
      }
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("reuses a succeeded attempt for the same idempotency key", async () => {
    const fixture = await fixtureCreate()
    try {
      const input = {
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-succeeded-reuse",
        sourceBinding,
        targetBinding,
      }
      const created = fixture.repository.storageMigrationCreate(input)
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
      })
      expect(
        fixture.repository.storageMigrationStatusUpdate(created.data.id, "succeeded", { ownership }),
      ).toMatchObject({
        success: true,
      })
      expect(fixture.repository.storageMigrationCreate(input)).toMatchObject({
        success: true,
        data: { id: created.data.id, attempt: 1, status: "succeeded" },
      })
      expect(fixture.connection.db.select().from(storageMigrationTable).all()).toHaveLength(1)
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("enforces lifecycle transitions and makes repeated status updates idempotent", async () => {
    const fixture = await fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-lifecycle",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)

      expect(
        fixture.repository.storageMigrationStatusUpdate(created.data.id, "succeeded", { ownership }),
      ).toMatchObject({
        success: false,
      })
      expect(
        fixture.repository.storageMigrationStatusUpdate(created.data.id, "queued", { ownership, now: "invalid" }),
      ).toMatchObject({ success: false })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
        data: { status: "running", startedAt: now },
      })
      const repeated = fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", {
        ownership,
        lastError: "must not overwrite an idempotent update",
        now: "2026-09-01T01:00:00.000Z",
      })
      expect(repeated).toMatchObject({ success: true, data: { status: "running", lastError: null, updatedAt: now } })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "queued", { ownership })).toMatchObject({
        success: false,
      })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "failed", { ownership })).toMatchObject({
        success: true,
        data: { status: "failed" },
      })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: false,
      })
      expect(
        fixture.repository.storageMigrationStatusUpdate(created.data.id, "failed", { ownership, now: "invalid" }),
      ).toMatchObject({ success: false })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("rejects terminal, regressing, and inconsistent progress updates", async () => {
    const fixture = await fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-progress-invariants",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)

      const valid = {
        phase: "copying" as const,
        totalObjects: 3,
        discoveredObjects: 3,
        copiedObjects: 1,
        verifiedObjects: 0,
        totalBytes: 30,
        copiedBytes: 10,
        currentObjectKey: "private/source/one.jpg",
      }
      expect(fixture.repository.storageMigrationProgressUpdate(created.data.id, valid, { ownership })).toMatchObject({
        success: true,
      })
      for (const invalid of [
        { ...valid, copiedObjects: 0 },
        { ...valid, discoveredObjects: 4, totalObjects: 3 },
        { ...valid, copiedObjects: 4 },
        { ...valid, verifiedObjects: 2 },
        { ...valid, copiedBytes: 31 },
      ]) {
        expect(
          fixture.repository.storageMigrationProgressUpdate(created.data.id, invalid, { ownership }),
        ).toMatchObject({
          success: false,
        })
      }
      expect(
        fixture.repository.storageMigrationProgressUpdate(
          created.data.id,
          {
            ...valid,
            phase: "discovering",
          },
          { ownership },
        ),
      ).toMatchObject({ success: false })

      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
      })
      expect(
        fixture.repository.storageMigrationStatusUpdate(created.data.id, "succeeded", { ownership }),
      ).toMatchObject({
        success: true,
      })
      expect(
        fixture.repository.storageMigrationProgressUpdate(
          created.data.id,
          {
            ...valid,
            copiedObjects: 2,
          },
          { ownership },
        ),
      ).toMatchObject({ success: false })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("cuts over only after complete verification", async () => {
    const fixture = await fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-cutover-invariants",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)

      expect(fixture.repository.storageMigrationCutover(created.data.id, ownership)).toMatchObject({ success: false })
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
      })
      expect(fixture.repository.storageMigrationCutover(created.data.id, ownership)).toMatchObject({ success: false })
      expect(
        fixture.repository.storageMigrationProgressUpdate(
          created.data.id,
          {
            phase: "verifying",
            totalObjects: 1,
            discoveredObjects: 1,
            copiedObjects: 1,
            verifiedObjects: 1,
            totalBytes: 10,
            copiedBytes: 10,
            currentObjectKey: null,
          },
          { ownership, sourceInventoryFingerprint: "a".repeat(64) },
        ),
      ).toMatchObject({ success: true })
      expect(fixture.repository.storageMigrationCutover(created.data.id, ownership)).toMatchObject({
        success: true,
        data: { status: "succeeded", progress: { phase: "completed" } },
      })
      expect(fixture.repository.storageMigrationCutover(created.data.id, ownership)).toMatchObject({ success: false })
    } finally {
      await fixtureDelete(fixture)
    }
  })

  test("rejects stale lease writes to status, progress, and cutover", async () => {
    const fixture = await fixtureCreate()
    try {
      const created = fixture.repository.storageMigrationCreate({
        projectId: "project-1",
        environmentId: "environment-1",
        idempotencyKey: "migration-stale-lease",
        sourceBinding,
        targetBinding,
      })
      expect(created.success).toBe(true)
      if (!created.success) return
      const ownership = migrationJobCreate(fixture, created.data.id)
      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "running", { ownership })).toMatchObject({
        success: true,
      })
      expect(
        fixture.repository.storageMigrationProgressUpdate(
          created.data.id,
          {
            phase: "verifying",
            totalObjects: 1,
            discoveredObjects: 1,
            copiedObjects: 1,
            verifiedObjects: 1,
            totalBytes: 10,
            copiedBytes: 10,
            currentObjectKey: null,
          },
          { ownership, sourceInventoryFingerprint: "a".repeat(64) },
        ),
      ).toMatchObject({ success: true })

      fixture.connection.db
        .update(jobTable)
        .set({
          leaseOwner: "replacement-worker",
          leaseToken: "replacement-lease",
          leaseExpiresAt: "2026-09-01T01:00:00.000Z",
        })
        .where(eq(jobTable.id, ownership.jobId))
        .run()

      expect(fixture.repository.storageMigrationStatusUpdate(created.data.id, "failed", { ownership })).toMatchObject({
        success: false,
        retryable: true,
      })
      expect(
        fixture.repository.storageMigrationProgressUpdate(
          created.data.id,
          {
            phase: "cutting_over",
            totalObjects: 1,
            discoveredObjects: 1,
            copiedObjects: 1,
            verifiedObjects: 1,
            totalBytes: 10,
            copiedBytes: 10,
            currentObjectKey: null,
          },
          { ownership },
        ),
      ).toMatchObject({ success: false, retryable: true })
      expect(fixture.repository.storageMigrationCutover(created.data.id, ownership)).toMatchObject({
        success: false,
        retryable: true,
      })
      expect(fixture.repository.storageMigrationRead(created.data.id)).toMatchObject({
        success: true,
        data: { status: "running", progress: { phase: "verifying" } },
      })
      expect(fixture.connection.db.select().from(environmentTable).get()).toMatchObject({
        r2Bucket: sourceBinding.bucket,
        r2Prefix: sourceBinding.prefix,
      })
    } finally {
      await fixtureDelete(fixture)
    }
  })
})
