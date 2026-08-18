import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { catalogTable } from "../src/infrastructure/db/schema/catalogTable.js"
import { backupReceiptTable } from "../src/infrastructure/db/schema/backupReceiptTable.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { environmentTable } from "../src/infrastructure/db/schema/environmentTable.js"
import { legacyImportTable } from "../src/infrastructure/db/schema/legacyImportTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { rcloneBackupAdapterFake } from "../src/backup/rcloneBackupAdapterFake.js"
import { legacyImportExecutorCreate } from "../src/import/legacyImportExecutorCreate.js"
import { legacyImportPlanCreate } from "../src/import/legacyImportPlanCreate.js"
import { legacyTransformParse } from "../src/import/legacyTransformParse.js"
import { assetWorkflowHandlersRegister } from "../src/workflow/assetWorkflowHandlersRegister.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"

const now = "2026-08-17T00:00:00.000Z"

const fixtureCreate = async (root: string, conflicting = false): Promise<void> => {
  await mkdir(join(root, "images", "home", "500x500_webp"), { recursive: true })
  await mkdir(join(root, "images", "home", "100x100_webp_ai_generated"), { recursive: true })
  await mkdir(join(root, "videos", "home"), { recursive: true })
  await mkdir(join(root, "fonts", "ui"), { recursive: true })
  await mkdir(join(root, "documents", "guides"), { recursive: true })
  await mkdir(join(root, "src", "app", "assets"), { recursive: true })
  const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  await writeFile(join(root, "images", "home", "500x500_webp", "hero.png"), imageBytes)
  await writeFile(
    join(root, "images", "home", "100x100_webp_ai_generated", "hero.png"),
    conflicting ? new Uint8Array([9, 8, 7]) : imageBytes,
  )
  await writeFile(join(root, "images", "home", "hero.txt"), "Hero image\nAI: generated · fixture")
  await writeFile(
    join(root, "videos", "home", "clip.mp4"),
    new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]),
  )
  await writeFile(join(root, "fonts", "ui", "Inter-Regular.woff2"), new Uint8Array([119, 79, 70, 50]))
  await writeFile(join(root, "documents", "guides", "guide.txt"), "Guide document\n")
  await writeFile(
    join(root, "src", "app", "assets", "imageList.ts"),
    `export const imageList = ${JSON.stringify({
      home_hero: {
        path: "home/500x500_webp/hero.png",
        width: 500,
        height: 500,
        alt: "Generated list alt",
        mimeType: "image/png",
      },
    })} as const satisfies Record<string, ImageType>`,
  )
  await writeFile(
    join(root, "src", "app", "assets", "videoList.ts"),
    `export const videoList = ${JSON.stringify({
      home_clip: {
        path: "home/clip.mp4",
        mimeType: "video/mp4",
        image: { path: "home/clip.webp", width: 640, height: 360, alt: "Clip" },
      },
    })} as const satisfies Record<string, VideoType>`,
  )
  await writeFile(
    join(root, "src", "app", "assets", "fontList.ts"),
    `export const fontList = ${JSON.stringify({
      ui_inter_regular: {
        path: "ui/Inter-Regular.woff2",
        fontFamily: "Inter",
        fontStyle: "normal",
        fontWeight: 400,
        mimeType: "font/woff2",
      },
    })} as const satisfies Record<string, FontType>`,
  )
  await writeFile(
    join(root, "src", "app", "assets", "documentList.ts"),
    `export const documentList = ${JSON.stringify({
      guides_guide: { path: "guides/guide.txt", mimeType: "text/plain" },
    })} as const satisfies Record<string, DocumentType>`,
  )
}

const databaseCreate = () => {
  const opened = databaseOpen(":memory:")
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  for (const record of [
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
      name: "Example",
      slug: "example",
      defaultEnvironment: "development",
      createdAt: now,
      updatedAt: now,
    }),
    databaseRecordInsert(opened.data.db, environmentTable, {
      id: "environment-1",
      projectId: "project-1",
      name: "development",
      r2Bucket: "assets",
      r2Prefix: "project-1",
      publicBaseUrl: "https://assets.example.test",
      createdAt: now,
      updatedAt: now,
    }),
  ]) {
    if (!record.success) throw new Error(record.errorMessage)
  }
  return opened.data
}

describe("legacy import", () => {
  test("parses transform dimensions, formats, and AI suffixes", () => {
    expect(legacyTransformParse("500_webp")).toMatchObject({
      success: true,
      data: { width: 500, height: 500, format: "webp", aiProvenance: null },
    })
    expect(legacyTransformParse("640x360_jpg_ai_modified")).toMatchObject({
      success: true,
      data: { width: 640, height: 360, format: "jpg", aiProvenance: "enhanced" },
    })
    expect(legacyTransformParse("0x360_webp").success).toBe(false)
    expect(legacyTransformParse("640x360_gif").success).toBe(false)
  })

  test("merges same bytes, removes transforms from folders, and applies sidecar precedence", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "assets-service-legacy-import-"))
    try {
      await fixtureCreate(fixtureRoot)
      const planned = await legacyImportPlanCreate(fixtureRoot, { showAiLabel: false })
      expect(planned.success).toBe(true)
      if (!planned.success) return
      const image = planned.data.groups.find((group) => group.class === "image")
      expect(image).toMatchObject({
        folders: ["home"],
        basename: "hero",
        alt: "Hero image AI: generated · fixture",
        outputs: [{ key: "100x100_webp_ai_generated" }, { key: "500x500_webp" }],
      })
      expect(image?.outputs.find((output) => output.key === "100x100_webp_ai_generated")).toMatchObject({
        showAiLabel: false,
      })
      expect(image?.outputs).toHaveLength(2)
      expect(planned.data.groups.map((group) => group.class)).toEqual(["document", "font", "image", "video"])
      expect(planned.data.conflicts).toEqual([])
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })

  test("reports checksum conflicts deterministically", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "assets-service-legacy-import-"))
    try {
      await fixtureCreate(fixtureRoot, true)
      const planned = await legacyImportPlanCreate(fixtureRoot)
      expect(planned.success).toBe(true)
      if (!planned.success) return
      expect(planned.data.conflicts).toMatchObject([
        {
          code: "source_checksum_conflict",
          candidates: ["images/home/100x100_webp_ai_generated/hero.png", "images/home/500x500_webp/hero.png"],
        },
      ])
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })

  test("keeps unrelated assets in best-effort imports", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "assets-service-legacy-import-"))
    const connection = databaseCreate()
    try {
      await fixtureCreate(fixtureRoot, true)
      const executor = legacyImportExecutorCreate({
        db: connection.db,
        storage: memoryStorageAdapterCreate(),
        sourceRoot: fixtureRoot,
        now: () => new Date(now),
      })
      const imported = await executor.legacyImportRequestCreate("project-1", "actor-1", {
        root: fixtureRoot,
        atomicity: "best_effort",
      })
      expect(imported).toMatchObject({ success: true, data: { status: "queued", importedCount: 3 } })
      expect(connection.db.select().from(assetTable).all()).toHaveLength(3)
    } finally {
      databaseClose(connection)
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })

  test("creates source, output, and catalog records idempotently without changing the tree", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "assets-service-legacy-import-"))
    const connection = databaseCreate()
    try {
      await fixtureCreate(fixtureRoot)
      const before = await readFile(join(fixtureRoot, "images", "home", "hero.txt"), "utf8")
      const storage = memoryStorageAdapterCreate()
      const executor = legacyImportExecutorCreate({
        db: connection.db,
        storage,
        sourceRoot: fixtureRoot,
        now: () => new Date(now),
      })
      const first = await executor.legacyImportRequestCreate("project-1", "actor-1", {
        root: fixtureRoot,
        atomicity: "all_or_nothing",
      })
      expect(first).toMatchObject({ success: true, data: { status: "queued", importedCount: 4, conflicts: [] } })
      const repeated = await executor.legacyImportRequestCreate("project-1", "actor-1", {
        root: fixtureRoot,
        atomicity: "all_or_nothing",
      })
      expect(repeated).toEqual(first)
      expect(connection.db.select().from(assetTable).all()).toHaveLength(4)
      expect(connection.db.select().from(sourceRevisionTable).all()).toHaveLength(4)
      expect(connection.db.select().from(outputDefinitionTable).all()).toHaveLength(5)
      expect(connection.db.select().from(catalogTable).all()).toHaveLength(0)
      expect(connection.db.select().from(legacyImportTable).all()).toHaveLength(1)
      const backup = rcloneBackupAdapterFake({ completedAt: now })
      const registry = jobHandlerRegistryCreate()
      const registered = assetWorkflowHandlersRegister(registry, {
        db: connection.db,
        storage,
        backup,
        clock: () => new Date(now),
      })
      expect(registered.success).toBe(true)
      const engine = workflowEngineCreate({
        db: connection.db,
        workerId: "legacy-import-worker",
        handlerRegistry: registry,
        retryBackoffMs: () => 0,
        clock: () => new Date(now),
      })
      for (let index = 0; index < 12; index += 1) await engine.runOnce()
      expect(connection.db.select().from(catalogTable).all()).toHaveLength(1)
      expect(connection.db.select().from(backupReceiptTable).all()).toHaveLength(4)
      const completed = await executor.legacyImportStatusRead("project-1", first.success ? first.data.id : "missing")
      expect(completed).toMatchObject({ success: true, data: { status: "succeeded" } })
      expect(await readFile(join(fixtureRoot, "images", "home", "hero.txt"), "utf8")).toBe(before)
    } finally {
      databaseClose(connection)
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })
})
