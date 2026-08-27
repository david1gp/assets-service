import { mkdir, rm } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

import { auditEventRepositoryAppend } from "../src/audit/auditEventRepositoryAppend.js"
import { backupReceiptRepositoryCreate } from "../src/backup/backupReceiptRepositoryCreate.js"
import { manifestRepositoryCreate } from "../src/catalog/manifestRepositoryCreate.js"
import { outboxEventRepositoryEnqueue } from "../src/events/outboxEventRepositoryEnqueue.js"
import { outboxEventRepositoryMarkDelivered } from "../src/events/outboxEventRepositoryMarkDelivered.js"
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
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import { deletionStateRepositoryRead } from "../src/deletion/deletionStateRepositoryRead.js"
import { deletionStateRepositoryUpsert } from "../src/deletion/deletionStateRepositoryUpsert.js"

describe("SQLite persistence", () => {
  test("initializes WAL and foreign keys, migrates every persisted model, and rolls back failed transactions", async () => {
    await mkdir("data", { recursive: true })
    const databasePath = `data/persistence-${crypto.randomUUID()}.sqlite`
    const opened = databaseOpen(databasePath)

    expect(opened.success).toBe(true)
    if (!opened.success) return

    try {
      const migrated = databaseMigrate(opened.data)
      expect(migrated).toEqual({ success: true, data: null })

      const foreignKeys = opened.data.client.query("PRAGMA foreign_keys").get() as { foreign_keys: number }
      const journalMode = opened.data.client.query("PRAGMA journal_mode").get() as { journal_mode: string }
      expect(foreignKeys.foreign_keys).toBe(1)
      expect(journalMode.journal_mode).toBe("wal")

      const tables = opened.data.client
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '__drizzle%' ORDER BY name")
        .all() as Array<{ name: string }>
      expect(tables.map((table) => table.name)).toEqual([
        "asset_metadata",
        "asset_structure_folder_memberships",
        "assets",
        "audit_events",
        "backup_receipts",
        "backup_remote_path_migration_runs",
        "blobs",
        "catalog_generations",
        "catalog_outputs",
        "catalogs",
        "deletion_states",
        "environments",
        "job_dependencies",
        "jobs",
        "legacy_imports",
        "manifests",
        "organizations",
        "outbox_events",
        "output_definitions",
        "output_versions",
        "project_bindings",
        "project_grants",
        "projects",
        "reconciliation_runs",
        "source_revisions",
        "structure_folders",
        "uploads",
        "workflows",
      ])

      const organization = databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-1",
        name: "Example",
        slug: "example",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(organization.success).toBe(true)

      const project = databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-1",
        organizationId: "org-1",
        name: "Example project",
        slug: "example-project",
        defaultEnvironment: "development",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(project.success).toBe(true)

      const environment = databaseRecordInsert(opened.data.db, environmentTable, {
        id: "environment-1",
        projectId: "project-1",
        name: "development",
        r2Bucket: "assets-dev",
        r2Prefix: "project-1",
        publicBaseUrl: "https://assets.example.test",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(environment.success).toBe(true)

      const emptyPrefixEnvironment = databaseRecordInsert(opened.data.db, environmentTable, {
        id: "environment-empty-prefix",
        projectId: "project-1",
        name: "production",
        r2Bucket: "assets-prod",
        r2Prefix: "",
        publicBaseUrl: "https://assets.example.test",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(emptyPrefixEnvironment.success).toBe(true)

      const rolledBack = databaseTransactionRun(opened.data.db, (transaction) => {
        const inserted = databaseRecordInsert(transaction, organizationTable, {
          id: "org-rollback",
          name: "Rollback",
          slug: "rollback",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        })
        if (!inserted.success) return inserted
        return resultErrorCreate("persistenceTest", "rollback requested")
      })
      expect(rolledBack.success).toBe(false)
      expect(
        opened.data.db
          .select()
          .from(organizationTable)
          .all()
          .some((record) => record.id === "org-rollback"),
      ).toBe(false)

      const assetAndSource = databaseTransactionRun(opened.data.db, (transaction) => {
        const insertedAsset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-1",
          projectId: "project-1",
          class: "image",
          folder1: "home",
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-1",
          integrationNote: "Hero image",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        })
        if (!insertedAsset.success) return insertedAsset

        const insertedSource = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-1",
          assetId: "asset-1",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 10,
          sha256: "a".repeat(64),
          objectKey: "sources/asset-1/v1/hero.jpg",
          createdAt: "2026-08-17T00:00:00.000Z",
        })
        if (!insertedSource.success) return insertedSource
        return { success: true, data: null } as const
      })
      expect(assetAndSource.success).toBe(true)

      const workflow = databaseRecordInsert(opened.data.db, workflowTable, {
        id: "workflow-1",
        projectId: "project-1",
        assetId: "asset-1",
        kind: "asset_processing",
        status: "queued",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(workflow.success).toBe(true)

      const job = databaseRecordInsert(opened.data.db, jobTable, {
        id: "job-1",
        workflowId: "workflow-1",
        kind: "backup_original",
        status: "queued",
        availableAt: "2026-08-17T00:00:00.000Z",
        priority: 0,
        attempts: 0,
        retryLimit: 3,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        idempotencyKey: "backup-asset-1",
        payloadSchemaVersion: 1,
        payload: { assetId: "asset-1", sourceRevisionId: "source-1" },
        error: null,
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(job.success).toBe(true)

      const duplicatePath = databaseRecordInsert(opened.data.db, assetTable, {
        id: "asset-2",
        projectId: "project-1",
        class: "image",
        folder1: "home",
        folder2: null,
        folder3: null,
        filename: "hero.png",
        basename: "hero",
        currentSourceRevisionId: "source-2",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(duplicatePath.success).toBe(false)

      const invalidForeignKey = databaseRecordInsert(opened.data.db, environmentTable, {
        id: "environment-invalid",
        projectId: "missing-project",
        name: "production",
        r2Bucket: "assets-prod",
        r2Prefix: "missing-project",
        publicBaseUrl: "https://assets.example.test",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(invalidForeignKey.success).toBe(false)

      const audit = auditEventRepositoryAppend(opened.data.db, {
        id: "audit-1",
        organizationId: "org-1",
        projectId: "project-1",
        actorId: "actor-1",
        action: "asset.uploaded",
        resourceType: "asset",
        resourceId: "asset-1",
        details: { sourceRevisionId: "source-1" },
        createdAt: "2026-08-17T00:00:00.000Z",
      })
      expect(audit.success).toBe(true)

      const outbox = outboxEventRepositoryEnqueue(opened.data.db, {
        id: "outbox-1",
        eventId: "upload-event-1",
        kind: "customer_asset_uploaded",
        payload: { uploadId: "upload-1" },
        status: "pending",
        attempts: 0,
        availableAt: "2026-08-17T00:00:00.000Z",
        deliveredAt: null,
        lastError: null,
        createdAt: "2026-08-17T00:00:00.000Z",
      })
      expect(outbox.success).toBe(true)
      expect(outboxEventRepositoryMarkDelivered(opened.data.db, "outbox-1", "2026-08-17T00:01:00.000Z")).toMatchObject({
        success: true,
        data: { status: "delivered", deliveredAt: "2026-08-17T00:01:00.000Z" },
      })
      expect(
        outboxEventRepositoryEnqueue(opened.data.db, {
          id: "outbox-2",
          eventId: "upload-event-1",
          kind: "customer_asset_uploaded",
          payload: { uploadId: "upload-1" },
          status: "pending",
          attempts: 0,
          availableAt: "2026-08-17T00:00:00.000Z",
          deliveredAt: null,
          lastError: null,
          createdAt: "2026-08-17T00:00:00.000Z",
        }),
      ).toMatchObject({ success: true, data: { id: "outbox-1", eventId: "upload-event-1" } })

      const manifest = manifestRepositoryCreate(opened.data.db, {
        id: "manifest-1",
        projectId: "project-1",
        assetId: "asset-1",
        catalogGenerationId: null,
        kind: "asset",
        schema: "assets.manifest.v1",
        objectKey: "manifests/asset-1.json",
        byteSize: 100,
        sha256: "b".repeat(64),
        createdAt: "2026-08-17T00:00:00.000Z",
      })
      expect(manifest.success).toBe(true)

      const receipt = backupReceiptRepositoryCreate(opened.data.db, {
        id: "backup-1",
        projectId: "project-1",
        sourceRevisionId: "source-1",
        jobId: "job-1",
        remotePath: "gdrive_beta:backups/example/example-project/assets/home/source-1_hero.jpg",
        byteSize: 10,
        sha256: "a".repeat(64),
        checkResult: "verified",
        completedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(receipt.success).toBe(true)

      const deletion = deletionStateRepositoryUpsert(opened.data.db, {
        id: "deletion-1",
        assetId: "asset-1",
        status: "requested",
        completedSteps: [],
        pendingRemoteObjects: ["public/images/home/hero.jpg"],
        requestedAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      })
      expect(deletion.success).toBe(true)
      const readDeletion = deletionStateRepositoryRead(opened.data.db, "asset-1")
      expect(readDeletion).toMatchObject({ success: true, data: { id: "deletion-1", status: "requested" } })
    } finally {
      databaseClose(opened.data)
      await rm(databasePath, { force: true })
      await rm(`${databasePath}-wal`, { force: true })
      await rm(`${databasePath}-shm`, { force: true })
    }
  })
})
