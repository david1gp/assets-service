import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { blobTable } from "../src/infrastructure/db/schema/blobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"

const now = "2026-08-31T00:00:00.000Z"

type MigrationJournal = {
  entries: Array<{ idx: number }>
  [key: string]: unknown
}

const legacyMigrationFolderCreate = () => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-project-output-migrations-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    const migrationNumber = Number.parseInt(filename.slice(0, 4), 10)
    if (filename.endsWith(".sql") && migrationNumber <= 11)
      copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as MigrationJournal
  journal.entries = journal.entries.filter((entry) => entry.idx <= 11)
  writeFileSync(join(metaFolder, "_journal.json"), JSON.stringify(journal))
  return migrationFolder
}

test("project-scoped output migration backfills ownership and relaxes blob key collisions", () => {
  const migrationFolder = legacyMigrationFolderCreate()
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    expect(
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-project-output-migration",
        name: "Project output migration",
        slug: "project-output-migration",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    for (const project of ["project-output-a", "project-output-b"])
      expect(
        databaseRecordInsert(opened.data.db, projectTable, {
          id: project,
          organizationId: "org-project-output-migration",
          name: project,
          slug: project,
          defaultEnvironment: "development",
          createdAt: now,
          updatedAt: now,
        }).success,
      ).toBe(true)

    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-output-migration",
          projectId: "project-output-a",
          class: "image",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "hero.jpg",
          basename: "hero",
          currentSourceRevisionId: "source-output-migration",
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        return databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-output-migration",
          assetId: "asset-output-migration",
          revision: 1,
          class: "image",
          originalFilename: "hero.jpg",
          mediaType: "image/jpeg",
          byteSize: 1,
          sha256: "a".repeat(64),
          objectKey: "sources/asset-output-migration/1/hero.jpg",
          createdAt: now,
        })
      }).success,
    ).toBe(true)
    opened.data.client
      .prepare(
        "INSERT INTO output_definitions (id, asset_id, kind, key, width, height, format, quality, show_ai_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("output-output-migration", "asset-output-migration", "image", "default", 1, 1, "webp", null, null, now, now)
    opened.data.client
      .prepare(
        "INSERT INTO output_versions (id, output_definition_id, asset_id, source_revision_id, version, byte_size, sha256, media_type, extension, object_key, toolchain_version, width, height, current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "version-output-migration",
        "output-output-migration",
        "asset-output-migration",
        "source-output-migration",
        1,
        1,
        "b".repeat(64),
        "image/webp",
        "webp",
        "images/hero_default_v1.webp",
        "legacy",
        1,
        1,
        1,
        now,
      )
    opened.data.client
      .prepare(
        "INSERT INTO blobs (id, project_id, asset_id, source_revision_id, output_version_id, storage, environment, kind, object_key, byte_size, sha256, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "blob-output-migration",
        "project-output-a",
        null,
        null,
        null,
        "private",
        null,
        "manifest",
        "shared-output-key",
        1,
        "c".repeat(64),
        "application/octet-stream",
        now,
      )

    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    expect(
      opened.data.client.query("SELECT project_id FROM output_versions WHERE id = 'version-output-migration'").get(),
    ).toEqual({ project_id: "project-output-a" })
    expect(
      (
        opened.data.client.query("PRAGMA table_info(output_versions)").all() as Array<{
          name: string
          notnull: number
        }>
      ).find((column) => column.name === "project_id"),
    ).toMatchObject({ notnull: 0 })
    expect(opened.data.client.query("PRAGMA foreign_key_check").all()).toEqual([])
    expect(
      opened.data.client.query("PRAGMA index_info(output_versions_project_object_key_unique)").all(),
    ).toMatchObject([
      { seqno: 0, name: "project_id" },
      { seqno: 1, name: "object_key" },
    ])

    expect(
      databaseRecordInsert(opened.data.db, blobTable, {
        id: "blob-output-migration-other-project",
        projectId: "project-output-b",
        assetId: null,
        sourceRevisionId: null,
        outputVersionId: null,
        storage: "private",
        environment: null,
        kind: "manifest",
        objectKey: "shared-output-key",
        byteSize: 1,
        sha256: "d".repeat(64),
        mediaType: "application/octet-stream",
        createdAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, blobTable, {
        id: "blob-output-migration-duplicate",
        projectId: "project-output-a",
        assetId: null,
        sourceRevisionId: null,
        outputVersionId: null,
        storage: "private",
        environment: null,
        kind: "manifest",
        objectKey: "shared-output-key",
        byteSize: 1,
        sha256: "e".repeat(64),
        mediaType: "application/octet-stream",
        createdAt: now,
      }).success,
    ).toBe(false)
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})

test("project-scoped output migration aborts before dropping orphaned output versions", () => {
  const migrationFolder = legacyMigrationFolderCreate()
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    opened.data.client.exec("PRAGMA foreign_keys = OFF")
    opened.data.client
      .prepare(
        "INSERT INTO output_versions (id, output_definition_id, asset_id, source_revision_id, version, byte_size, sha256, media_type, extension, object_key, toolchain_version, width, height, current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "orphan-output-version",
        "missing-output-definition",
        "missing-asset",
        null,
        1,
        1,
        "a".repeat(64),
        "image/webp",
        "webp",
        "images/orphan.webp",
        "legacy",
        1,
        1,
        1,
        now,
      )
    opened.data.client.exec("PRAGMA foreign_keys = ON")

    const migrated = databaseMigrate(opened.data)
    expect(migrated.success).toBe(false)
    if (migrated.success) return
    expect(migrated.errorMessage).toContain("__output_versions_project_ownership_guard")
    expect(opened.data.client.query("SELECT id FROM output_versions").all()).toEqual([{ id: "orphan-output-version" }])
    expect(
      opened.data.client
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__output_versions_project_ownership_guard'",
        )
        .all(),
    ).toEqual([])
    expect(
      opened.data.client
        .query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'output_versions_object_key_unique'")
        .all(),
    ).toEqual([{ name: "output_versions_object_key_unique" }])

    opened.data.client.exec("PRAGMA foreign_keys = OFF")
    opened.data.client.prepare("DELETE FROM output_versions WHERE id = ?").run("orphan-output-version")
    opened.data.client.exec("PRAGMA foreign_keys = ON")
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})

test("project-scoped output migration accepts legacy inserts and assigns asset ownership", () => {
  const migrationFolder = legacyMigrationFolderCreate()
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    expect(
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-project-output-compatibility",
        name: "Project output compatibility",
        slug: "project-output-compatibility",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-output-compatibility",
        organizationId: "org-project-output-compatibility",
        name: "Project output compatibility",
        slug: "project-output-compatibility",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-output-compatibility",
          projectId: "project-output-compatibility",
          class: "image",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "compatibility.jpg",
          basename: "compatibility",
          currentSourceRevisionId: "source-output-compatibility",
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        const source = databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-output-compatibility",
          assetId: asset.data.id,
          revision: 1,
          class: "image",
          originalFilename: "compatibility.jpg",
          mediaType: "image/jpeg",
          byteSize: 1,
          sha256: "b".repeat(64),
          objectKey: "sources/asset-output-compatibility/1/compatibility.jpg",
          createdAt: now,
        })
        if (!source.success) return source
        return databaseRecordInsert(transaction, outputDefinitionTable, {
          id: "output-output-compatibility",
          assetId: asset.data.id,
          kind: "image",
          key: "default",
          width: 1,
          height: 1,
          format: "webp",
          quality: null,
          showAiLabel: null,
          createdAt: now,
          updatedAt: now,
        })
      }).success,
    ).toBe(true)
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })

    opened.data.client
      .prepare(
        "INSERT INTO output_versions (id, output_definition_id, asset_id, source_revision_id, version, byte_size, sha256, media_type, extension, object_key, toolchain_version, width, height, current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "legacy-output-version",
        "output-output-compatibility",
        "asset-output-compatibility",
        "source-output-compatibility",
        1,
        1,
        "c".repeat(64),
        "image/webp",
        "webp",
        "images/compatibility_default_v1.webp",
        "legacy",
        1,
        1,
        1,
        now,
      )

    expect(
      opened.data.client
        .query("SELECT project_id, asset_id FROM output_versions WHERE id = 'legacy-output-version'")
        .get(),
    ).toEqual({ project_id: "project-output-compatibility", asset_id: "asset-output-compatibility" })
    expect(
      (
        opened.data.client.query("PRAGMA table_info(output_versions)").all() as Array<{
          name: string
          notnull: number
        }>
      ).find((column) => column.name === "project_id"),
    ).toMatchObject({ notnull: 0 })
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})
