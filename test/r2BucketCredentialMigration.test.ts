import { expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { r2BucketCredentialTable } from "../src/infrastructure/db/schema/r2BucketCredentialTable.js"

type MigrationJournal = {
  entries: Array<{ idx: number }>
  [key: string]: unknown
}

const migrationFolderCreate = () => {
  const sourceFolder = resolve("drizzle")
  const migrationFolder = mkdtempSync(join(tmpdir(), "assets-r2-credential-migration-"))
  const metaFolder = join(migrationFolder, "meta")
  mkdirSync(metaFolder)
  for (const filename of readdirSync(sourceFolder)) {
    const migrationNumber = Number.parseInt(filename.slice(0, 4), 10)
    if (filename.endsWith(".sql") && migrationNumber <= 23)
      copyFileSync(join(sourceFolder, filename), join(migrationFolder, filename))
  }
  const journal = JSON.parse(readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8")) as MigrationJournal
  journal.entries = journal.entries.filter((entry) => entry.idx <= 23)
  writeFileSync(join(metaFolder, "_journal.json"), JSON.stringify(journal))
  return migrationFolder
}

test("nullable R2 credential migration preserves existing revocation IDs", () => {
  const migrationFolder = migrationFolderCreate()
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) {
    rmSync(migrationFolder, { recursive: true, force: true })
    return
  }

  try {
    expect(databaseMigrate(opened.data, migrationFolder)).toEqual({ success: true, data: null })
    opened.data.client
      .prepare(
        "INSERT INTO r2_bucket_credentials (bucket, access_key_id_ciphertext, secret_access_key_ciphertext, revocation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("legacy-bucket", "encrypted-access", "encrypted-secret", "legacy-token", "2026-09-01", "2026-09-01")

    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const columns = opened.data.client.query("PRAGMA table_info(r2_bucket_credentials)").all() as Array<{
      name: string
      notnull: number
    }>
    expect(columns.find((column) => column.name === "revocation_id")?.notnull).toBe(0)
    expect(opened.data.db.select().from(r2BucketCredentialTable).all()).toMatchObject([
      { bucket: "legacy-bucket", revocationId: "legacy-token" },
    ])
    opened.data.client
      .prepare(
        "INSERT INTO r2_bucket_credentials (bucket, access_key_id_ciphertext, secret_access_key_ciphertext, revocation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("imported-bucket", "encrypted-access-2", "encrypted-secret-2", null, "2026-09-02", "2026-09-02")
    expect(opened.data.db.select().from(r2BucketCredentialTable).all()).toHaveLength(2)
  } finally {
    databaseClose(opened.data)
    rmSync(migrationFolder, { recursive: true, force: true })
  }
})
