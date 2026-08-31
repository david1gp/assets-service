import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import { jobSchema } from "../src/workflow/jobSchema.js"

const now = "2026-08-17T00:00:00.000Z"

type MigrationJournal = {
  entries: Array<{ idx: number }>
  [key: string]: unknown
}

const migrationFolderCreate = () => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-legacy-import-migrations-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    const migrationNumber = Number.parseInt(filename.slice(0, 4), 10)
    if (filename.endsWith(".sql") && migrationNumber <= 10) {
      copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
    }
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as MigrationJournal
  journal.entries = journal.entries.filter((entry) => entry.idx <= 10)
  writeFileSync(join(metaFolder, "_journal.json"), JSON.stringify(journal))
  return migrationFolder
}

const databaseCreate = () => {
  const migrationFolder = migrationFolderCreate()
  const opened = databaseOpen(":memory:")
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    throw new Error(opened.errorMessage)
  }
  const migrated = databaseMigrate(opened.data, migrationFolder)
  if (!migrated.success) {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
    throw new Error(migrated.errorMessage)
  }
  return { connection: opened.data, migrationFolder }
}

const databaseSeed = (connection: ReturnType<typeof databaseCreate>["connection"]) => {
  const seeded = databaseTransactionRun(connection.db, (transaction) => {
    const organization = databaseRecordInsert(transaction, organizationTable, {
      id: "org-legacy-import",
      name: "Legacy import migration",
      slug: "legacy-import-migration",
      createdAt: now,
      updatedAt: now,
    })
    if (!organization.success) return organization

    const project = databaseRecordInsert(transaction, projectTable, {
      id: "project-legacy-import",
      organizationId: organization.data.id,
      name: "Legacy import migration",
      slug: "legacy-import-migration",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    })
    if (!project.success) return project

    for (const asset of [
      { id: "asset-imported", sourceId: "source-imported", basename: "imported" },
      { id: "asset-ordinary", sourceId: "source-ordinary", basename: "ordinary" },
    ]) {
      const insertedAsset = databaseRecordInsert(transaction, assetTable, {
        id: asset.id,
        projectId: project.data.id,
        class: "image",
        folder1: null,
        folder2: null,
        folder3: null,
        filename: `${asset.basename}.jpg`,
        basename: asset.basename,
        currentSourceRevisionId: asset.sourceId,
        integrationNote: asset.id === "asset-imported" ? "legacy import" : null,
        createdAt: now,
        updatedAt: now,
      })
      if (!insertedAsset.success) return insertedAsset

      const insertedSource = databaseRecordInsert(transaction, sourceRevisionTable, {
        id: asset.sourceId,
        assetId: asset.id,
        revision: 1,
        class: "image",
        originalFilename: `${asset.basename}.jpg`,
        mediaType: "image/jpeg",
        byteSize: 10,
        sha256: asset.id.padEnd(64, "a"),
        objectKey: `sources/${asset.id}/v1/${asset.basename}.jpg`,
        createdAt: now,
      })
      if (!insertedSource.success) return insertedSource
    }
    return { success: true, data: null } as const
  })
  if (!seeded.success) throw new Error(seeded.errorMessage)

  connection.client
    .prepare(
      "INSERT INTO legacy_imports (id, project_id, actor_id, root, environment, atomicity, status, imported_count, conflicts, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "import-1",
      "project-legacy-import",
      "actor-1",
      "/legacy-assets",
      "development",
      "best_effort",
      "queued",
      1,
      "[]",
      now,
      now,
      null,
    )

  const workflowInsert = connection.client.prepare(
    "INSERT INTO workflows (id, project_id, asset_id, source_revision_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
  workflowInsert.run(
    "workflow-import",
    "project-legacy-import",
    "asset-imported",
    "source-imported",
    "asset_processing",
    "queued",
    now,
    now,
  )
  workflowInsert.run(
    "workflow-import-terminal",
    "project-legacy-import",
    "asset-imported",
    "source-imported",
    "asset_processing",
    "succeeded",
    now,
    now,
  )
  workflowInsert.run(
    "workflow-mixed",
    "project-legacy-import",
    "asset-ordinary",
    "source-ordinary",
    "asset_processing",
    "queued",
    now,
    now,
  )

  const jobInsert = connection.client.prepare(
    "INSERT INTO jobs (id, workflow_id, kind, status, available_at, priority, attempts, retry_limit, lease_owner, lease_expires_at, heartbeat_at, idempotency_key, payload_schema_version, payload, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
  for (const job of [
    {
      id: "job-import-queued",
      workflowId: "workflow-import",
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-import-running",
      workflowId: "workflow-import",
      status: "running",
      leaseOwner: "worker-1",
      leaseExpiresAt: "2026-08-17T00:05:00.000Z",
      heartbeatAt: "2026-08-17T00:04:00.000Z",
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-import-retryable",
      workflowId: "workflow-import",
      status: "retryable",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: null },
    },
    {
      id: "job-import-succeeded",
      workflowId: "workflow-import",
      status: "succeeded",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-terminal-import",
      workflowId: "workflow-import-terminal",
      status: "succeeded",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-import-dead",
      workflowId: "workflow-import-terminal",
      status: "dead",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-import-cancelled",
      workflowId: "workflow-import-terminal",
      status: "cancelled",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-imported", legacyImportId: "import-1" },
    },
    {
      id: "job-mixed-import",
      workflowId: "workflow-mixed",
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-ordinary", legacyImportId: "import-1" },
    },
    {
      id: "job-mixed-ordinary",
      workflowId: "workflow-mixed",
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      payload: { assetId: "asset-ordinary" },
    },
  ]) {
    jobInsert.run(
      job.id,
      job.workflowId,
      "verify_original",
      job.status,
      now,
      0,
      0,
      3,
      job.leaseOwner,
      job.leaseExpiresAt,
      job.heartbeatAt,
      `${job.id}-idempotency`,
      1,
      JSON.stringify(job.payload),
      null,
      now,
      now,
    )
  }

  const dependencyInsert = connection.client.prepare(
    "INSERT INTO job_dependencies (id, job_id, depends_on_job_id, created_at) VALUES (?, ?, ?, ?)",
  )
  dependencyInsert.run("dependency-import", "job-import-queued", "job-import-succeeded", now)

  connection.client
    .prepare(
      "INSERT INTO backup_receipts (id, project_id, source_revision_id, job_id, remote_path, byte_size, sha256, check_result, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "receipt-import",
      "project-legacy-import",
      "source-imported",
      "job-import-succeeded",
      "backups/imported.jpg",
      10,
      "a".repeat(64),
      "verified",
      now,
    )
}

describe("legacy import removal migration", () => {
  test("cancels outstanding import jobs while retaining assets, ordinary jobs, and references", () => {
    const database = databaseCreate()
    try {
      databaseSeed(database.connection)

      expect(databaseMigrate(database.connection)).toEqual({ success: true, data: null })
      expect(
        database.connection.client
          .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_imports'")
          .all(),
      ).toEqual([])

      const assets = database.connection.db
        .select({ id: assetTable.id, integrationNote: assetTable.integrationNote })
        .from(assetTable)
        .all()
        .sort((left, right) => left.id.localeCompare(right.id))
      expect(assets).toEqual([
        { id: "asset-imported", integrationNote: "legacy import" },
        { id: "asset-ordinary", integrationNote: null },
      ])

      const jobs = new Map(
        database.connection.db
          .select()
          .from(jobTable)
          .all()
          .map((job) => [job.id, job]),
      )
      for (const id of ["job-import-queued", "job-import-running", "job-import-retryable", "job-mixed-import"]) {
        expect(jobs.get(id)).toMatchObject({
          status: "cancelled",
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        })
        expect(jobs.get(id)?.updatedAt).not.toBe(now)
      }
      expect(jobs.get("job-import-succeeded")).toMatchObject({ status: "succeeded" })
      expect(jobs.get("job-terminal-import")).toMatchObject({ status: "succeeded" })
      expect(jobs.get("job-import-dead")).toMatchObject({ status: "dead" })
      expect(jobs.get("job-import-cancelled")).toMatchObject({ status: "cancelled" })
      expect(jobs.get("job-mixed-ordinary")).toMatchObject({
        status: "queued",
        payload: { assetId: "asset-ordinary" },
      })
      expect(jobs.get("job-mixed-ordinary")?.updatedAt).toBe(now)

      for (const job of jobs.values()) {
        expect(v.safeParse(jobSchema, job).success).toBe(true)
      }

      const workflows = new Map(
        database.connection.db
          .select()
          .from(workflowTable)
          .all()
          .map((workflow) => [workflow.id, workflow]),
      )
      expect(workflows.get("workflow-import")).toMatchObject({ status: "cancelled" })
      expect(workflows.get("workflow-import-terminal")).toMatchObject({ status: "succeeded" })
      expect(workflows.get("workflow-mixed")).toMatchObject({ status: "queued" })

      expect(
        database.connection.client
          .query(
            "SELECT id, status FROM jobs WHERE CASE WHEN json_valid(payload) THEN json_type(payload, '$.legacyImportId') ELSE NULL END IS NOT NULL ORDER BY id",
          )
          .all(),
      ).toEqual([])
      expect(database.connection.client.query("SELECT id FROM job_dependencies ORDER BY id").all()).toEqual([
        { id: "dependency-import" },
      ])
      expect(
        database.connection.client.query("SELECT id FROM backup_receipts WHERE id = 'receipt-import'").all(),
      ).toEqual([{ id: "receipt-import" }])
      expect(database.connection.client.query("PRAGMA foreign_key_check").all()).toEqual([])
    } finally {
      databaseClose(database.connection)
      rmSync(database.migrationFolder, { recursive: true, force: true })
    }
  })
})
