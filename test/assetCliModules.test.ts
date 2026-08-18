import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"
import { assetDiffClassify } from "../src/asset-cli/assetDiffClassify.js"
import { assetSourceMediaTypeRead } from "../src/asset-cli/assetSourceMediaTypeRead.js"
import { assetSourcePreflight } from "../src/asset-cli/assetSourcePreflight.js"
import { configuredRootScan } from "../src/asset-cli/configuredRootScan.js"
import { localAssetManifestLoad } from "../src/asset-cli/localAssetManifestLoad.js"
import { remoteAssetHistoryManifestLoad } from "../src/asset-cli/remoteAssetHistoryManifestLoad.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"

const sourceDirectories = (root: string) =>
  ({
    image: join(root, "images"),
    video: null,
    document: join(root, "documents"),
    font: null,
  }) as const

const envelopeResponseCreate = (data: unknown): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } })

const sourceCreate = (input: {
  id: string
  assetId: string
  filename: string
  sha256: string
  byteSize: number
  mediaType?: string
}) => ({
  id: input.id,
  assetId: input.assetId,
  revision: 1,
  class: "image" as const,
  originalFilename: input.filename,
  mediaType: input.mediaType ?? "image/jpeg",
  byteSize: input.byteSize,
  sha256: input.sha256,
  objectKey: `sources/${input.id}/${input.filename}`,
  createdAt: "2026-08-18T00:00:00.000Z",
})

const assetCreate = (input: { id: string; filename: string; sha256: string; byteSize: number }) => {
  const source = sourceCreate({ ...input, assetId: input.id })
  return {
    id: input.id,
    projectId: "project-1",
    class: "image" as const,
    folders: [],
    filename: input.filename,
    basename: input.filename.slice(0, input.filename.lastIndexOf(".")),
    currentSourceRevisionId: source.id,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    sourcePath: input.filename,
    outputCount: 0,
    sourceHistory: [source],
    outputHistory: [],
  }
}

test("configured roots scan files in stable project-relative order and reject symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-scan-"))
  try {
    await mkdir(join(root, "images", "nested"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await writeFile(join(root, "images", "nested", "photo.jpg"), "photo")
    await writeFile(join(root, "documents", "guide.txt"), "guide")
    const scanned = await configuredRootScan(root, sourceDirectories(root))
    expect(scanned).toEqual({
      success: true,
      data: {
        root,
        files: [
          { class: "document", filePath: join(root, "documents", "guide.txt"), sourcePath: "documents/guide.txt" },
          {
            class: "image",
            filePath: join(root, "images", "nested", "photo.jpg"),
            sourcePath: "images/nested/photo.jpg",
          },
        ],
      },
    })

    await symlink(join(root, "images", "nested", "photo.jpg"), join(root, "images", "linked.jpg"))
    expect((await configuredRootScan(root, sourceDirectories(root))).success).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("configured roots skip disabled classes, accept overrides, and reject special files", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-roots-"))
  try {
    await mkdir(join(root, "media", "nested"), { recursive: true })
    await mkdir(join(root, "ignored"), { recursive: true })
    await writeFile(join(root, "media", "nested", "photo.jpg"), "photo")
    await writeFile(join(root, "ignored", "video.mp4"), "video")
    const configured = {
      image: join(root, "media"),
      video: null,
      document: null,
      font: null,
    } as const
    const scanned = await configuredRootScan(root, configured)
    expect(scanned.success).toBe(true)
    if (!scanned.success) return
    expect(scanned.data.files.map((file) => file.sourcePath)).toEqual(["media/nested/photo.jpg"])

    const fifoPath = join(root, "media", "pipe")
    const fifo = Bun.spawn(["mkfifo", fifoPath])
    expect(await fifo.exited).toBe(0)
    expect((await configuredRootScan(root, configured)).success).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("configured root ordering compares NFC-normalized paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-unicode-order-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "z.jpg"), "z")
    await writeFile(join(root, "images", "ä.jpg"), "a-umlaut")
    await writeFile(join(root, "images", "á.jpg"), "a-acute")
    const scanned = await configuredRootScan(root, sourceDirectories(root))
    expect(scanned.success).toBe(true)
    if (!scanned.success) return
    expect(scanned.data.files.map((file) => file.sourcePath)).toEqual(["images/z.jpg", "images/á.jpg", "images/ä.jpg"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("preflight strips class roots, validates documents, and reports depth and normalized collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-preflight-"))
  try {
    await mkdir(join(root, "images", "a", "b", "c", "d"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await writeFile(join(root, "images", "a", "b", "c", "d", "too-deep.jpg"), "deep")
    await writeFile(join(root, "images", "café.jpg"), "one")
    await writeFile(join(root, "images", "café.jpg"), "two")
    await writeFile(join(root, "documents", "guide.pdf"), "%PDF")
    const scanned = await configuredRootScan(root, sourceDirectories(root))
    expect(scanned.success).toBe(true)
    if (!scanned.success) return
    const preflight = assetSourcePreflight(scanned.data, sourceDirectories(root))
    expect(preflight.success).toBe(true)
    if (!preflight.success) return
    const entries = preflight.data.entries
    expect(entries.find((entry) => entry.file.sourcePath === "documents/guide.pdf")?.mediaType).toBe("application/pdf")
    expect(entries.filter((entry) => entry.status === "conflict")).toHaveLength(3)
    expect(assetSourceMediaTypeRead("document", "guide.json")).toEqual({ success: true, data: "application/json" })
    expect(assetSourceMediaTypeRead("image", "guide.pdf").success).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("source media type mapping covers every supported asset extension", () => {
  const mappings = [
    ["image", "jpg", "image/jpeg"],
    ["image", "jpeg", "image/jpeg"],
    ["image", "png", "image/png"],
    ["image", "gif", "image/gif"],
    ["image", "webp", "image/webp"],
    ["image", "avif", "image/avif"],
    ["video", "mp4", "video/mp4"],
    ["video", "webm", "video/webm"],
    ["font", "ttf", "font/ttf"],
    ["font", "otf", "font/otf"],
    ["font", "woff", "font/woff"],
    ["font", "woff2", "font/woff2"],
    ["document", "pdf", "application/pdf"],
    ["document", "json", "application/json"],
    ["document", "doc", "application/msword"],
    ["document", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["document", "xls", "application/vnd.ms-excel"],
    ["document", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["document", "xlsm", "application/vnd.ms-excel.sheet.macroenabled.12"],
    ["document", "ppt", "application/vnd.ms-powerpoint"],
    ["document", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["document", "odt", "application/vnd.oasis.opendocument.text"],
    ["document", "ods", "application/vnd.oasis.opendocument.spreadsheet"],
    ["document", "odp", "application/vnd.oasis.opendocument.presentation"],
    ["document", "rtf", "application/rtf"],
    ["document", "csv", "text/csv"],
    ["document", "txt", "text/plain"],
  ] as const
  for (const [assetClass, extension, mediaType] of mappings)
    expect(assetSourceMediaTypeRead(assetClass, `asset.${extension}`)).toEqual({ success: true, data: mediaType })
})

test("local manifests fingerprint supported files and preserve deletion identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-fingerprint-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const content = new TextEncoder().encode("matching")
    await writeFile(join(root, "images", "matching.jpg"), content)
    const manifest = await localAssetManifestLoad(root, sourceDirectories(root))
    expect(manifest.success).toBe(true)
    if (!manifest.success) return
    const entry = manifest.data.entries[0]
    expect(entry?.fingerprint).toMatchObject({
      byteSize: content.byteLength,
      sha256: contentSha256Create(content),
      mediaType: "image/jpeg",
    })
    expect(entry?.fingerprint?.identity.inode).toBeGreaterThan(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local manifests fingerprint large files without changing their identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-modules-large-fingerprint-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const content = new Uint8Array(2 * 1024 * 1024).fill(19)
    await writeFile(join(root, "images", "large.jpg"), content)
    const manifest = await localAssetManifestLoad(root, sourceDirectories(root))
    expect(manifest.success).toBe(true)
    if (!manifest.success) return
    expect(manifest.data.entries[0]?.fingerprint).toMatchObject({
      byteSize: content.byteLength,
      sha256: contentSha256Create(content),
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("remote history manifests use paginated asset loading and retain deletion eligibility", async () => {
  const first = assetCreate({ id: "asset-1", filename: "first.jpg", sha256: "a".repeat(64), byteSize: 1 })
  const second = assetCreate({ id: "asset-2", filename: "second.jpg", sha256: "b".repeat(64), byteSize: 2 })
  const requests: string[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (input) => {
      const url = new URL(input)
      requests.push(url.search)
      return envelopeResponseCreate(
        url.searchParams.has("cursor")
          ? { assets: [first], page: { limit: 100, nextCursor: null } }
          : { assets: [second], page: { limit: 100, nextCursor: "1" } },
      )
    },
  })
  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const manifest = await remoteAssetHistoryManifestLoad({
    client: {
      assetsReadAll: clientResult.data.assetsReadAll,
      sourceRevisionDeletionEligibilityRead: async (_projectId, _environment, sourceRevisionId) => ({
        success: true,
        data: {
          sourceRevisionId,
          eligible: true,
          checks: {
            sourceIdentity: true,
            verifiedBackup: true,
            successfulWorkflow: true,
            lineageMatchingCurrentOutputs: true,
            currentCatalogInclusion: true,
          },
        },
      }),
    },
    projectId: "project-1",
    environment: "development",
  })
  expect(manifest.success).toBe(true)
  if (!manifest.success) return
  expect(requests).toEqual(["?include=history&limit=100", "?cursor=1&include=history&limit=100"])
  expect(manifest.data.entries.map((entry) => entry.filename)).toEqual(["first.jpg", "second.jpg"])
  expect(manifest.data.entries[0]?.deletionEligibility?.eligible).toBe(true)
})

test("remote history manifests reject malformed current history and source identities", async () => {
  const asset = assetCreate({ id: "asset-malformed", filename: "guide.jpg", sha256: "a".repeat(64), byteSize: 1 })
  const source = asset.sourceHistory[0]
  if (source === undefined) return
  const malformedHistory = {
    ...asset,
    sourceHistory: [source, source],
  }
  const mismatchedPath = { ...asset, sourcePath: "other.jpg" }
  const manifest = await remoteAssetHistoryManifestLoad({
    client: { assetsReadAll: async () => ({ success: true, data: [malformedHistory, mismatchedPath] }) },
    projectId: "project-1",
  })
  expect(manifest.success).toBe(true)
  if (!manifest.success) return
  expect(manifest.data.entries.every((entry) => !entry.valid)).toBe(true)
  expect(manifest.data.entries.map((entry) => entry.errorMessage)).toEqual([
    "The source history contained a duplicate revision id for asset asset-malformed",
    "The remote source path did not match the logical asset identity for asset asset-malformed",
  ])
})

test("diff classification is complete, fingerprint-based, and deterministically ordered", () => {
  const makeLocal = (filename: string, status: "valid" | "unsupported" | "conflict", sha256 = "a".repeat(64)) => ({
    file: { class: "image" as const, filePath: `/project/images/${filename}`, sourcePath: `images/${filename}` },
    mapping:
      status === "valid"
        ? {
            class: "image" as const,
            filePath: `/project/images/${filename}`,
            sourcePath: `images/${filename}`,
            logicalPath: filename,
            folders: [],
            filename,
            basename: filename.slice(0, filename.lastIndexOf(".")),
            keys: {
              logicalKey: JSON.stringify(["image", filename]),
              targetKey: JSON.stringify(["image", filename.split(".")[0]]),
            },
          }
        : undefined,
    mediaType: status === "valid" ? ("image/jpeg" as const) : undefined,
    status,
    ...(status === "unsupported" ? { errorMessage: "unsupported" } : {}),
    ...(status === "conflict" ? { errorMessage: "conflict" } : {}),
    ...(status === "valid"
      ? {
          fingerprint: {
            byteSize: 1,
            sha256,
            mediaType: "image/jpeg" as const,
            identity: { device: 1, inode: 1, size: 1, mtimeMs: 1, ctimeMs: 1 },
          },
        }
      : {}),
  })
  const makeRemote = (filename: string, sha256: string, byteSize = 1) => ({
    assetId: `asset-${filename}`,
    class: "image" as const,
    folders: [],
    filename,
    sourcePath: filename,
    logicalPath: filename,
    keys: {
      logicalKey: JSON.stringify(["image", filename]),
      targetKey: JSON.stringify(["image", filename.split(".")[0]]),
    },
    currentSourceRevisionId: `source-${filename}`,
    sourceHistory: [],
    outputHistory: [],
    byteSize,
    sha256,
    mediaType: "image/jpeg",
    deletionEligibility: null,
    valid: true,
  })

  const result = assetDiffClassify({
    local: [
      makeLocal("z-unsupported.bin", "unsupported"),
      makeLocal("a-new.jpg", "valid"),
      makeLocal("m-matching.jpg", "valid", "b".repeat(64)),
      makeLocal("c-changed.jpg", "valid", "c".repeat(64)),
      makeLocal("d-conflict.jpg", "conflict"),
    ],
    remote: [
      makeRemote("remote-only.jpg", "d".repeat(64)),
      makeRemote("m-matching.jpg", "b".repeat(64)),
      makeRemote("c-changed.jpg", "a".repeat(64)),
    ],
  })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.entries.map((entry) => [entry.sourcePath, entry.status])).toEqual([
    ["images/a-new.jpg", "new"],
    ["images/c-changed.jpg", "changed"],
    ["images/d-conflict.jpg", "conflict"],
    ["images/z-unsupported.bin", "unsupported"],
    ["images/m-matching.jpg", "matching"],
    ["remote-only.jpg", "remote-only"],
  ])
  expect(result.data.entries.find((entry) => entry.status === "matching")?.deletionEligible).toBe(false)
})

test("diff classification rejects normalized duplicate remote identities, including remote-only entries", () => {
  const makeRemote = (filename: string, id: string) => ({
    assetId: id,
    class: "image" as const,
    folders: [],
    filename,
    sourcePath: filename.normalize("NFC"),
    logicalPath: filename.normalize("NFC"),
    keys: {
      logicalKey: JSON.stringify(["image", filename.normalize("NFC")]),
      targetKey: JSON.stringify(["image", filename.slice(0, filename.lastIndexOf(".")).normalize("NFC")]),
    },
    currentSourceRevisionId: `source-${id}`,
    sourceHistory: [],
    outputHistory: [],
    byteSize: 1,
    sha256: "a".repeat(64),
    mediaType: "image/jpeg",
    deletionEligibility: null,
    valid: true,
  })
  const result = assetDiffClassify({
    local: [],
    remote: [makeRemote("café.jpg", "asset-composed"), makeRemote("café.jpg", "asset-decomposed")],
  })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.entries.map((entry) => entry.status)).toEqual(["conflict", "conflict"])
})
