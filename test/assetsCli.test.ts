import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assetsCliMain } from "../src/entrypoints/assets-cli.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import type { AssetClass } from "../src/schemas/assetClassSchema.js"

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data, requestId: "request-1" }), {
    status,
    headers: { "content-type": "application/json" },
  })

const failureResponseCreate = (message: string, status = 401): Response =>
  new Response(
    JSON.stringify({
      ok: false,
      error: { code: "unauthorized", message, retryable: false },
      requestId: "request-auth",
    }),
    { status, headers: { "content-type": "application/json" } },
  )

const sourceCreate = (input: {
  id: string
  assetId: string
  filename: string
  sha256: string
  byteSize: number
  class?: AssetClass
  mediaType?: string
}) => ({
  id: input.id,
  assetId: input.assetId,
  revision: 1,
  class: input.class ?? ("image" as const),
  originalFilename: input.filename,
  mediaType: input.mediaType ?? "image/jpeg",
  byteSize: input.byteSize,
  sha256: input.sha256,
  objectKey: `sources/${input.id}/${input.filename}`,
  createdAt: "2026-08-18T00:00:00.000Z",
})

const assetCreate = (input: {
  id: string
  filename: string
  sha256: string
  byteSize: number
  sourceRevisionId?: string
  class?: AssetClass
  mediaType?: string
  folders?: string[]
  sourcePath?: string
  alt?: string | null
}) => {
  const source = sourceCreate({
    id: input.sourceRevisionId ?? input.id,
    assetId: input.id,
    filename: input.filename,
    sha256: input.sha256,
    byteSize: input.byteSize,
    class: input.class,
    mediaType: input.mediaType,
  })
  const folders = input.folders ?? []
  return {
    id: input.id,
    projectId: "project-1",
    class: input.class ?? ("image" as const),
    folders,
    filename: input.filename,
    basename: input.filename.slice(0, input.filename.lastIndexOf(".")),
    currentSourceRevisionId: source.id,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    sourcePath: input.sourcePath ?? input.filename,
    outputCount: 0,
    sourceHistory: [source],
    outputHistory: [],
    ...(input.alt === undefined
      ? {}
      : {
          metadata: {
            id: `metadata-${input.id}`,
            assetId: input.id,
            sourceRevisionId: source.id,
            metadata: {
              kind: "image" as const,
              width: 1,
              height: 1,
              format: "jpg" as const,
              colorSpace: "sRGB",
              alpha: false,
              orientationApplied: true,
              frameCount: 1,
              animated: false,
              alt: input.alt,
              aiProvenance: null,
            },
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
          },
        }),
  }
}

const deletionEligibilityCreate = (sourceRevisionId: string, eligible = true) => ({
  sourceRevisionId,
  eligible,
  checks: {
    sourceIdentity: true,
    verifiedBackup: eligible,
    successfulWorkflow: eligible,
    lineageMatchingCurrentOutputs: eligible,
    currentCatalogInclusion: eligible,
  },
})

const cliEnvironment = {
  ASSETS_API_URL: "https://assets.example.test",
  ASSETS_TOKEN: "service-token",
  ASSETS_PROJECT: "project-1",
  ASSETS_ENVIRONMENT: "development",
  ASSETS_CONFIG_FILE: join(tmpdir(), "assets-cli-test-missing-config.json"),
  ASSETS_SESSION_FILE: join(tmpdir(), "assets-cli-test-missing-session.json"),
}

test("diff help documents its root and all source directory controls", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["diff", "--help", "--json"], {
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: true,
    data: {
      commands: expect.arrayContaining(["diff [root]", "upload-all [root] --integration-note <text>"]),
      options: expect.arrayContaining(["--dry-run", "--delete"]),
      diff: {
        root: "Default: .",
        sourceDirectories: [
          "image: ./images, --image-dir <directory>, --no-image-dir",
          "video: ./videos, --video-dir <directory>, --no-video-dir",
          "document: ./documents, --document-dir <directory>, --no-document-dir",
          "font: ./fonts, --font-dir <directory>, --no-font-dir",
        ],
      },
    },
  })
})

test("doctor reports remote checks in a deterministic JSON envelope", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["doctor", "--json"], {
    env: cliEnvironment,
    fetcher: async (input) => {
      const path = new URL(input).pathname
      if (path.endsWith("/health")) return envelopeResponseCreate({ status: "ok" })
      if (path.endsWith("/ready")) return envelopeResponseCreate({ status: "ready" })
      return envelopeResponseCreate({
        id: "environment-1",
        projectId: "project-1",
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "public",
        publicBaseUrl: "https://cdn.example.test",
        createdAt: "2026-08-17T12:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
      })
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(output).toHaveLength(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      checks: [
        { name: "api", status: "ok" },
        { name: "readiness", status: "ok" },
        { name: "environment", status: "ok" },
      ],
      environment: "development",
      ok: true,
      projectId: "project-1",
    },
  })
  expect(output[0]).toBe(
    '{"data":{"checks":[{"name":"api","status":"ok"},{"name":"readiness","status":"ok"},{"name":"environment","status":"ok"}],"environment":"development","ok":true,"projectId":"project-1"},"ok":true}\n',
  )
})

test("lists --check returns a nonzero exit when generated files differ", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-lists-"))
  await writeFile(join(directory, "imageList.ts"), "different\n")
  await writeFile(join(directory, "videoList.ts"), "")
  await writeFile(join(directory, "fontList.ts"), "")
  await writeFile(join(directory, "documentList.ts"), "")
  const output: string[] = []

  const exitCode = await assetsCliMain(["lists", "--check", "--dir", directory, "--json"], {
    env: cliEnvironment,
    fetcher: async () =>
      envelopeResponseCreate({ imageList: "", videoList: "", fontList: "", documentList: "", digest: "0".repeat(64) }),
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      digest: "0".repeat(64),
      files: {
        fontListPath: join(directory, "fontList.ts"),
        documentListPath: join(directory, "documentList.ts"),
        imageListPath: join(directory, "imageList.ts"),
        videoListPath: join(directory, "videoList.ts"),
      },
      matches: false,
    },
  })
})

test("remote upload sends an intent, the exact bytes, and completion without local fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-upload-"))
  try {
    const filePath = join(directory, "card.png")
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    await writeFile(filePath, bytes)
    const output: string[] = []
    const requests: Request[] = []
    const exitCode = await assetsCliMain(
      ["upload", filePath, "--path", "home/card.png", "--integration-note", "Use the card", "--json"],
      {
        env: cliEnvironment,
        fetcher: async (input, init) => {
          const request = new Request(input, init)
          requests.push(request)
          if (request.url.includes("/uploads/intent"))
            return envelopeResponseCreate({
              uploadId: "upload-1",
              status: "pending",
              intent: {
                method: "PUT",
                url: "https://upload.example.test/staging/upload-1",
                key: "private/staging/upload-1",
                expiresAt: "2026-08-17T12:10:00.000Z",
                headers: { "content-length": String(bytes.byteLength), "content-type": "image/png" },
                mediaType: "image/png",
                byteSize: bytes.byteLength,
              },
            })
          if (request.url.includes("upload.example.test")) return new Response(null, { status: 200 })
          return envelopeResponseCreate({
            uploadId: "upload-1",
            assetId: "asset-1",
            sourceRevisionId: "source-1",
            workflowId: "workflow-1",
            status: "accepted",
          })
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["POST", "PUT", "POST"])
    expect(new Uint8Array(await requests[1]!.arrayBuffer())).toEqual(bytes)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        completion: {
          assetId: "asset-1",
          sourceRevisionId: "source-1",
          status: "accepted",
          uploadId: "upload-1",
          workflowId: "workflow-1",
        },
        status: "pending",
        uploadId: "upload-1",
      },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("upload-all uploads only new and changed files in stable order and skips matching files", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const changedBytes = new TextEncoder().encode("changed locally")
    const matchingBytes = new TextEncoder().encode("matching")
    const newBytes = new TextEncoder().encode("new")
    await writeFile(join(root, "images", "changed.jpg"), changedBytes)
    await writeFile(join(root, "images", "matching.jpg"), matchingBytes)
    await writeFile(join(root, "images", "new.jpg"), newBytes)
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const changed = assetCreate({
      id: "asset-changed",
      filename: "changed.jpg",
      sha256: "c".repeat(64),
      byteSize: changedBytes.byteLength,
    })
    const requests: Request[] = []
    let uploadNumber = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching, changed], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        uploadNumber += 1
        const uploadId = `upload-${uploadNumber}`
        return envelopeResponseCreate({
          uploadId,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${uploadId}`,
            key: `private/staging/${uploadId}`,
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "0", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: Number(request.body ? JSON.parse(await request.text()).byteSize : 0),
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.includes("/uploads/upload-1/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-1",
          assetId: "asset-new-changed",
          sourceRevisionId: "source-changed",
          workflowId: "workflow-changed",
          status: "accepted",
        })
      return envelopeResponseCreate({
        uploadId: "upload-2",
        assetId: "asset-new",
        sourceRevisionId: "source-new",
        workflowId: "workflow-new",
        status: "accepted",
      })
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "PUT", "POST", "POST", "PUT", "POST"])
    expect(
      requests
        .filter((request) => request.url.includes("upload.example.test"))
        .every((request) => request.headers.get("authorization") === null),
    ).toBe(true)
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(changedBytes)
    expect(new Uint8Array(await requests[5]!.arrayBuffer())).toEqual(newBytes)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        delete: false,
        dryRun: false,
        environment: "development",
        altUpdated: 0,
        altUpdatesPending: 0,
        root,
        wait: false,
        entries: [
          {
            action: "uploaded",
            assetId: "asset-new-changed",
            class: "image",
            logicalPath: "changed.jpg",
            sourcePath: "images/changed.jpg",
            sourceRevisionId: "source-changed",
            status: "changed",
            uploadId: "upload-1",
            workflowId: "workflow-changed",
          },
          {
            action: "skipped",
            class: "image",
            logicalPath: "matching.jpg",
            sourcePath: "images/matching.jpg",
            status: "matching",
          },
          {
            action: "uploaded",
            assetId: "asset-new",
            class: "image",
            logicalPath: "new.jpg",
            sourcePath: "images/new.jpg",
            sourceRevisionId: "source-new",
            status: "new",
            uploadId: "upload-2",
            workflowId: "workflow-new",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all uploads a new image, then applies its markdown sidecar alt to the created asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-new-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("new image")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "  Hero alt  \n")
    await writeFile(join(root, "images", "hero.txt"), "Fallback alt")
    const requests: Request[] = []
    const metadataBodies: unknown[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-new-alt",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-new-alt",
            key: "private/staging/upload-new-alt",
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(bytes.byteLength), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: bytes.byteLength,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-new-alt/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-new-alt",
          assetId: "asset-new-alt",
          sourceRevisionId: "source-new-alt",
          workflowId: "workflow-new-alt",
          status: "accepted",
        })
      if (url.pathname.endsWith("/assets/asset-new-alt/metadata")) {
        metadataBodies.push(await request.json())
        const detail = assetCreate({
          id: "asset-new-alt",
          filename: "hero.jpg",
          sha256: contentSha256Create(bytes),
          byteSize: bytes.byteLength,
          sourceRevisionId: "source-new-alt",
          alt: "Hero alt",
        })
        const { outputCount: _outputCount, ...assetDetail } = detail
        return envelopeResponseCreate(assetDetail)
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "PUT", "POST", "PATCH"])
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(bytes)
    expect(metadataBodies).toEqual([{ alt: "Hero alt" }])
    expect(requests.filter((request) => request.url.includes("/uploads/intent"))).toHaveLength(1)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 1,
        altUpdatesPending: 1,
        entries: [
          {
            action: "uploaded",
            altChanged: true,
            altUpdated: true,
            assetId: "asset-new-alt",
            localAlt: "Hero alt",
            remoteAlt: null,
            sourcePath: "images/hero.jpg",
            status: "new",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all updates metadata-only drift without uploading matching bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-metadata-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const remote = assetCreate({
      id: "asset-metadata",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const requests: Request[] = []
    const metadataBodies: unknown[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/assets/asset-metadata/metadata")) {
        metadataBodies.push(await request.json())
        const { outputCount: _outputCount, ...assetDetail } = remote
        return envelopeResponseCreate({
          ...assetDetail,
          metadata: { ...remote.metadata, metadata: { ...remote.metadata!.metadata, alt: "Local alt" } },
        })
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH"])
    expect(metadataBodies).toEqual([{ alt: "Local alt" }])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 1,
        altUpdatesPending: 1,
        entries: [
          {
            action: "skipped",
            altChanged: true,
            altUpdated: true,
            localAlt: "Local alt",
            remoteAlt: "Remote alt",
            status: "metadata",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all does not update metadata when the sidecar alt already matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-matching-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Same alt")
    const remote = assetCreate({
      id: "asset-matching-alt",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Same alt",
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 0,
        altUpdatesPending: 0,
        entries: [{ action: "skipped", status: "matching" }],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all dry-run reports pending alt metadata without mutating the service", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-dry-run-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const remote = assetCreate({
      id: "asset-dry-run-alt",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--dry-run", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 0,
        altUpdatesPending: 1,
        dryRun: true,
        entries: [
          {
            action: "planned",
            altChanged: true,
            altUpdatePlanned: true,
            localAlt: "Local alt",
            remoteAlt: "Remote alt",
            status: "metadata",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all dry-run is read-only and delete rejects no-wait", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-dry-run-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "new.jpg"), "new")
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
    }
    const output: string[] = []
    const dryRunExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--dry-run", "--json"],
      {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )
    expect(dryRunExitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: { dryRun: true, entries: [{ action: "planned", status: "new" }] },
    })

    const invalidOutput: string[] = []
    const invalidExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--no-wait", "--json"],
      {
        env: cliEnvironment,
        fetcher: async () => {
          throw new Error("network should not be reached")
        },
        stdout: (text) => invalidOutput.push(text),
        stderr: () => undefined,
      },
    )
    expect(invalidExitCode).toBe(1)
    expect(JSON.parse(invalidOutput[0] ?? "")).toMatchObject({
      ok: false,
      error: { message: "--delete requires waiting and cannot be used with --no-wait" },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all delete implies waiting and checks exact revisions before unlinking", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-delete-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const matchingBytes = new TextEncoder().encode("matching")
    await writeFile(join(root, "images", "matching.jpg"), matchingBytes)
    await writeFile(join(root, "images", "new.jpg"), "new")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const requests: Request[] = []
    const eligibilityRevisionIds: string[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-new",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-new",
            key: "private/staging/upload-new",
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "3", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 3,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-new/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-new",
          assetId: "asset-new",
          sourceRevisionId: "source-new",
          workflowId: "workflow-new",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-new/status"))
        return envelopeResponseCreate({
          id: "workflow-new",
          projectId: "project-1",
          assetId: "asset-new",
          sourceRevisionId: "source-new",
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        eligibilityRevisionIds.push(sourceRevisionId)
        return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(eligibilityRevisionIds).toEqual(["asset-matching", "source-new"])
    expect(
      requests
        .filter((request) => request.url.includes("/deletion-eligibility"))
        .map((request) => new URL(request.url).search),
    ).toEqual(["?environment=development", "?environment=development"])
    expect(
      requests.filter((request) => request.url.includes("upload.example.test"))[0]?.headers.get("authorization"),
    ).toBeNull()
    expect(await Bun.file(join(root, "images", "matching.jpg")).exists()).toBe(false)
    expect(await Bun.file(join(root, "images", "new.jpg")).exists()).toBe(false)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        delete: true,
        wait: true,
        entries: [
          { action: "skipped", deleted: true, eligible: true, status: "matching" },
          { action: "uploaded", deleted: true, eligible: true, status: "new", workflowStatus: "succeeded" },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all blocks the complete set on preflight failure and retains every local entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-preflight-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "valid.jpg"), "valid")
    await writeFile(join(root, "images", "unsupported.bin"), "unsupported")
    const requests: Request[] = []
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", sourcePath: "images/unsupported.bin", status: "unsupported" },
          { action: "skipped", sourcePath: "images/valid.jpg", status: "new" },
        ],
      },
    })
    expect(await Bun.file(join(root, "images", "valid.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "unsupported.bin")).exists()).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all rejects a replacement after preflight without blocking later uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-replacement-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const replacedPath = join(root, "images", "a.jpg")
    const replacementPath = join(root, "a-replacement.jpg")
    await writeFile(replacedPath, "a")
    await writeFile(join(root, "images", "b.jpg"), "b")
    const requests: Request[] = []
    let replaced = false
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        if (!replaced) {
          replaced = true
          await writeFile(replacementPath, "a")
          await rename(replacementPath, replacedPath)
        }
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      }
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-b",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-b",
            key: "private/staging/upload-b",
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "1", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 1,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      return envelopeResponseCreate({
        uploadId: "upload-b",
        assetId: "asset-b",
        sourceRevisionId: "source-b",
        workflowId: "workflow-b",
        status: "accepted",
      })
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "PUT", "POST"])
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(new Uint8Array([0x62]))
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", sourcePath: "images/a.jpg", status: "new" },
          { action: "uploaded", sourcePath: "images/b.jpg", status: "new", assetId: "asset-b" },
        ],
      },
    })
    expect(await Bun.file(replacedPath).exists()).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all reports workflow results per entry and only cleans up succeeded uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-workflow-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "failed.jpg"), "f")
    await writeFile(join(root, "images", "succeeded.jpg"), "s")
    const requests: Request[] = []
    let uploadNumber = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        uploadNumber += 1
        const uploadId = `upload-${uploadNumber}`
        return envelopeResponseCreate({
          uploadId,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${uploadId}`,
            key: `private/staging/${uploadId}`,
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "1", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 1,
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-1/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-1",
          assetId: "asset-failed",
          sourceRevisionId: "source-failed",
          workflowId: "workflow-failed",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-failed/status"))
        return envelopeResponseCreate({
          id: "workflow-failed",
          projectId: "project-1",
          assetId: "asset-failed",
          sourceRevisionId: "source-failed",
          kind: "asset_processing",
          status: "failed",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.endsWith("/uploads/upload-2/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-2",
          assetId: "asset-succeeded",
          sourceRevisionId: "source-succeeded",
          workflowId: "workflow-succeeded",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-succeeded/status"))
        return envelopeResponseCreate({
          id: "workflow-succeeded",
          projectId: "project-1",
          assetId: "asset-succeeded",
          sourceRevisionId: "source-succeeded",
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("source-succeeded"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.some((request) => request.url.includes("source-failed/deletion-eligibility"))).toBe(false)
    expect(await Bun.file(join(root, "images", "failed.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "succeeded.jpg")).exists()).toBe(false)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", status: "new", workflowStatus: "failed" },
          { action: "uploaded", status: "new", workflowStatus: "succeeded", deleted: true },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all continues after mixed upload failures and keeps nonzero output deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-mixed-results-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    for (const filename of ["a.jpg", "b.jpg", "c.jpg", "d.jpg"])
      await writeFile(join(root, "images", filename), filename)
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        const body = (await request.json()) as { originalFilename: string }
        if (body.originalFilename === "a.jpg") return failureResponseCreate("intent failed", 400)
        return envelopeResponseCreate({
          uploadId: `upload-${body.originalFilename[0]}`,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${body.originalFilename[0]}`,
            key: `private/staging/${body.originalFilename[0]}`,
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": "5", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 5,
          },
        })
      }
      if (url.hostname === "upload.example.test") {
        if (url.pathname.endsWith("/b")) return new Response(null, { status: 502 })
        return new Response(null, { status: 200 })
      }
      if (url.pathname.endsWith("/uploads/upload-c/complete")) return failureResponseCreate("completion failed", 500)
      const uploadId = url.pathname.split("/").at(-2) ?? ""
      return envelopeResponseCreate({
        uploadId,
        assetId: `asset-${uploadId.at(-1)}`,
        sourceRevisionId: `source-${uploadId.at(-1)}`,
        workflowId: `workflow-${uploadId.at(-1)}`,
        status: "accepted",
      })
    }

    const output: string[] = []
    const firstExitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    const secondExitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(firstExitCode).toBe(1)
    expect(secondExitCode).toBe(1)
    expect(output[0]).toBe(output[1])
    const value = JSON.parse(output[0] ?? "{}") as { data?: { entries?: Array<Record<string, unknown>> } }
    expect(value.data?.entries?.map((entry) => [entry.sourcePath, entry.action, entry.error])).toEqual([
      ["images/a.jpg", "failed", "intent failed"],
      ["images/b.jpg", "failed", "The direct upload was rejected (502): "],
      ["images/c.jpg", "failed", "completion failed"],
      ["images/d.jpg", "uploaded", undefined],
    ])
    expect(value.data?.entries?.find((entry) => entry.sourcePath === "images/d.jpg")).toMatchObject({
      assetId: "asset-d",
      sourceRevisionId: "source-d",
      uploadId: "upload-d",
    })
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(8)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all keeps an interrupted upload for a rerun that cleans up the matching revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-rerun-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("retry")
    const filePath = join(root, "images", "retry.jpg")
    await writeFile(filePath, bytes)
    const matching = assetCreate({
      id: "asset-retry",
      filename: "retry.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      sourceRevisionId: "source-retry",
      sourcePath: "retry.jpg",
    })
    const requests: Request[] = []
    let manifestRead = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        manifestRead += 1
        return envelopeResponseCreate({
          assets: manifestRead === 1 ? [] : [matching],
          page: { limit: 100, nextCursor: null },
        })
      }
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-retry",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-retry",
            key: "private/staging/upload-retry",
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(bytes.byteLength), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: bytes.byteLength,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-retry/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-retry",
          assetId: "asset-retry",
          sourceRevisionId: "source-retry",
          workflowId: "workflow-retry",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-retry/status"))
        return failureResponseCreate("workflow polling was interrupted", 503)
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("source-retry"))
      throw new Error(`Unexpected request ${request.url}`)
    }

    const firstOutput: string[] = []
    const firstExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => firstOutput.push(text), stderr: () => undefined },
    )
    expect(firstExitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(JSON.parse(firstOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: { entries: [{ action: "failed", status: "new", sourceRevisionId: "source-retry" }] },
    })

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => secondOutput.push(text), stderr: () => undefined },
    )
    expect(secondExitCode).toBe(0)
    expect(await Bun.file(filePath).exists()).toBe(false)
    expect(JSON.parse(secondOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: { entries: [{ action: "skipped", deleted: true, eligible: true, status: "matching" }] },
    })
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(1)
    expect(requests.filter((request) => request.url.includes("/deletion-eligibility"))).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retries matching cleanup after an unlink failure without deleting directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-cleanup-retry-"))
  const imagesPath = join(root, "images")
  try {
    const nestedPath = join(imagesPath, "nested")
    const filePath = join(nestedPath, "keep.jpg")
    await mkdir(nestedPath, { recursive: true })
    const bytes = new TextEncoder().encode("keep")
    await writeFile(filePath, bytes)
    const matching = assetCreate({
      id: "asset-cleanup",
      filename: "keep.jpg",
      folders: ["nested"],
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      sourceRevisionId: "source-cleanup",
      sourcePath: "nested/keep.jpg",
    })
    let eligibilityCalls = 0
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        eligibilityCalls += 1
        await chmod(nestedPath, eligibilityCalls === 1 ? 0o500 : 0o755)
        return envelopeResponseCreate(deletionEligibilityCreate("source-cleanup"))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }

    const firstOutput: string[] = []
    const firstExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => firstOutput.push(text), stderr: () => undefined },
    )
    expect(firstExitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(JSON.parse(firstOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            action: "failed",
            deleted: false,
            eligible: true,
            error: `Could not delete the local file: ${filePath}`,
            status: "matching",
          },
        ],
      },
    })

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => secondOutput.push(text), stderr: () => undefined },
    )
    expect(secondExitCode).toBe(0)
    expect(await Bun.file(filePath).exists()).toBe(false)
    expect((await stat(nestedPath)).isDirectory()).toBe(true)
    expect(JSON.parse(secondOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [{ action: "skipped", deleted: true, eligible: true, status: "matching" }],
      },
    })
    expect(eligibilityCalls).toBe(2)
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(0)
  } finally {
    await chmod(join(imagesPath, "nested"), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retains a file changed after eligibility is granted", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-changed-delete-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const filePath = join(root, "images", "changed.jpg")
    const original = new TextEncoder().encode("original")
    await writeFile(filePath, original)
    const matching = assetCreate({
      id: "asset-changed-delete",
      filename: "changed.jpg",
      sha256: contentSha256Create(original),
      byteSize: original.byteLength,
      sourceRevisionId: "source-changed-delete",
    })
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        await writeFile(filePath, "changed after eligibility")
        return envelopeResponseCreate(deletionEligibilityCreate("source-changed-delete"))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(await readFile(filePath, "utf8")).toBe("changed after eligibility")
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            action: "failed",
            deleted: false,
            eligible: true,
            error: `The local file changed before deletion: ${filePath}`,
            status: "matching",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retains files for failed, cancelled, and polling-error workflows", async () => {
  const cases = [
    { name: "failed", kind: "status" as const, status: "failed" as const },
    { name: "cancelled", kind: "status" as const, status: "cancelled" as const },
    { name: "polling-error", kind: "polling-error" as const },
    { name: "polling-timeout", kind: "polling-timeout" as const },
  ] as const

  for (const outcome of cases) {
    const root = await mkdtemp(join(tmpdir(), `assets-cli-upload-all-${outcome.name}-`))
    try {
      await mkdir(join(root, "images"), { recursive: true })
      const filePath = join(root, "images", "workflow.jpg")
      await writeFile(filePath, "workflow")
      const requests: Request[] = []
      let pollCount = 0
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        const url = new URL(request.url)
        if (url.pathname.endsWith("/assets"))
          return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
        if (url.pathname.endsWith("/uploads/intent"))
          return envelopeResponseCreate({
            uploadId: `upload-${outcome.name}`,
            status: "pending",
            intent: {
              method: "PUT",
              url: `https://upload.example.test/staging/${outcome.name}`,
              key: `private/staging/${outcome.name}`,
              expiresAt: "2026-08-18T00:10:00.000Z",
              headers: { "content-length": "8", "content-type": "image/jpeg" },
              mediaType: "image/jpeg",
              byteSize: 8,
            },
          })
        if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
        if (url.pathname.endsWith(`/uploads/upload-${outcome.name}/complete`))
          return envelopeResponseCreate({
            uploadId: `upload-${outcome.name}`,
            assetId: `asset-${outcome.name}`,
            sourceRevisionId: `source-${outcome.name}`,
            workflowId: `workflow-${outcome.name}`,
            status: "accepted",
          })
        if (url.pathname.endsWith(`/workflows/workflow-${outcome.name}/status`)) {
          pollCount += 1
          if (outcome.kind === "polling-error") return failureResponseCreate("workflow polling failed", 503)
          if (outcome.kind === "polling-timeout")
            return envelopeResponseCreate({
              id: `workflow-${outcome.name}`,
              projectId: "project-1",
              assetId: `asset-${outcome.name}`,
              sourceRevisionId: `source-${outcome.name}`,
              kind: "asset_processing",
              status: "running",
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
            })
          return envelopeResponseCreate({
            id: `workflow-${outcome.name}`,
            projectId: "project-1",
            assetId: `asset-${outcome.name}`,
            sourceRevisionId: `source-${outcome.name}`,
            kind: "asset_processing",
            status: outcome.status,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
          })
        }
        throw new Error(`Unexpected request ${request.url}`)
      }
      const output: string[] = []
      const exitCode = await assetsCliMain(
        ["upload-all", root, "--integration-note", "bulk", "--delete", "--poll-interval", "0", "--json"],
        {
          env: cliEnvironment,
          fetcher,
          sleep: async () => undefined,
          stdout: (text) => output.push(text),
          stderr: () => undefined,
        },
      )
      const entry = (JSON.parse(output[0] ?? "{}").data?.entries ?? [])[0] as Record<string, unknown> | undefined

      expect(exitCode).toBe(1)
      expect(await Bun.file(filePath).exists()).toBe(true)
      expect(requests.filter((request) => request.url.includes("/deletion-eligibility"))).toHaveLength(0)
      expect(entry).toMatchObject({ action: "failed", status: "new" })
      if (outcome.kind === "status") expect(entry?.workflowStatus).toBe(outcome.status)
      if (outcome.kind === "polling-error") expect(entry?.error).toBe("workflow polling failed")
      if (outcome.kind === "polling-timeout")
        expect(entry?.error).toBe("The workflow did not finish before the polling limit")
      if (outcome.kind === "polling-timeout") expect(pollCount).toBe(60)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test("upload-all retains uploads when exact deletion revision eligibility is ineligible or mismatched", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-eligibility-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "mismatch.jpg"), "mismatch")
    await writeFile(join(root, "images", "ineligible.jpg"), "ineligible")
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        const body = (await request.json()) as { originalFilename: string }
        const key = body.originalFilename.startsWith("mismatch") ? "mismatch" : "ineligible"
        return envelopeResponseCreate({
          uploadId: `upload-${key}`,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${key}`,
            key: `private/staging/${key}`,
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(body.originalFilename.length), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: body.originalFilename === "mismatch.jpg" ? 8 : 10,
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-mismatch/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-mismatch",
          assetId: "asset-mismatch",
          sourceRevisionId: "source-mismatch",
          workflowId: "workflow-mismatch",
          status: "accepted",
        })
      if (url.pathname.endsWith("/uploads/upload-ineligible/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-ineligible",
          assetId: "asset-ineligible",
          sourceRevisionId: "source-ineligible",
          workflowId: "workflow-ineligible",
          status: "accepted",
        })
      if (url.pathname.includes("/workflows/")) {
        const workflowId = url.pathname.split("/").at(-2) ?? ""
        const key = workflowId.replace("workflow-", "")
        return envelopeResponseCreate({
          id: workflowId,
          projectId: "project-1",
          assetId: `asset-${key}`,
          sourceRevisionId: `source-${key}`,
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      }
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        return envelopeResponseCreate(
          sourceRevisionId === "source-mismatch"
            ? deletionEligibilityCreate("different-source")
            : deletionEligibilityCreate(sourceRevisionId, false),
        )
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--environment", "production", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => output.push(text), stderr: () => undefined },
    )
    const value = JSON.parse(output[0] ?? "{}") as { data?: { entries?: Array<Record<string, unknown>> } }

    expect(exitCode).toBe(1)
    expect(await Bun.file(join(root, "images", "mismatch.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "ineligible.jpg")).exists()).toBe(true)
    expect(value.data?.entries?.map((entry) => [entry.sourcePath, entry.eligible, entry.error])).toEqual([
      ["images/ineligible.jpg", false, "The source revision was not eligible for local deletion"],
      ["images/mismatch.jpg", false, "The deletion eligibility revision did not match"],
    ])
    expect(
      requests
        .filter((request) => request.url.includes("/deletion-eligibility"))
        .map((request) => new URL(request.url).search),
    ).toEqual(["?environment=production", "?environment=production"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all rejects symlinked source directories and file-valued roots before network mutations", async () => {
  const symlinkRoot = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-symlink-"))
  const target = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-symlink-target-"))
  const fileRoot = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-file-root-"))
  try {
    await writeFile(join(target, "card.jpg"), "card")
    await symlink(target, join(symlinkRoot, "images"))
    const symlinkRequests: Request[] = []
    const symlinkOutput: string[] = []
    const symlinkExitCode = await assetsCliMain(["upload-all", symlinkRoot, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        symlinkRequests.push(new Request(input, init))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => symlinkOutput.push(text),
      stderr: () => undefined,
    })

    await writeFile(join(fileRoot, "image-source"), "not a directory")
    await writeFile(join(fileRoot, "assets.config.json"), JSON.stringify({ image: "image-source" }))
    const fileRootRequests: Request[] = []
    const fileRootOutput: string[] = []
    const fileRootExitCode = await assetsCliMain(["upload-all", fileRoot, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        fileRootRequests.push(new Request(input, init))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => fileRootOutput.push(text),
      stderr: () => undefined,
    })

    expect(symlinkExitCode).toBe(1)
    expect(fileRootExitCode).toBe(1)
    expect(symlinkRequests).toHaveLength(0)
    expect(fileRootRequests).toHaveLength(0)
    expect(JSON.parse(symlinkOutput[0] ?? "{}")).toMatchObject({ ok: false })
    expect(JSON.parse(fileRootOutput[0] ?? "{}")).toMatchObject({ ok: false })
  } finally {
    await rm(symlinkRoot, { recursive: true, force: true })
    await rm(target, { recursive: true, force: true })
    await rm(fileRoot, { recursive: true, force: true })
  }
})

test("upload-all human output keeps deterministic entry ordering", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-human-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "z.jpg"), "z")
    await writeFile(join(root, "images", "a.jpg"), "a")
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--dry-run"], {
      env: cliEnvironment,
      fetcher: async () => envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } }),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(output[0]).toBe(
      `Root: ${root}\nEnvironment: development\nWait: no\nDelete: no\nDry run: yes\n` +
        "new image images/a.jpg planned\nnew image images/z.jpg planned\n" +
        "Summary: uploaded=0 skipped=0 planned=2 failed=0 alt-updated=0 alt-updates-pending=0\n",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("remote errors stay remote and return a failure envelope with a nonzero exit", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["list", "--json"], {
    env: cliEnvironment,
    fetcher: async () => {
      throw new Error("service offline")
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    error: {
      code: "service_unavailable",
      message: "The assets service could not be reached",
      retryable: true,
    },
    ok: false,
  })
})

test("diff preserves missing authentication behavior without exposing credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-auth-"))
  try {
    const { ASSETS_TOKEN: _token, ...missingAuthEnvironment } = cliEnvironment
    const requests: Request[] = []
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root, "--json"], {
      env: missingAuthEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return failureResponseCreate("Authentication is required")
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests[0]?.headers.get("authorization")).toBeNull()
    expect(output[0]).toBe(
      '{"error":{"code":"unauthorized","message":"Authentication is required","retryable":false},"ok":false,"requestId":"request-auth"}\n',
    )
    expect(output[0]).not.toContain("service-token")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("remote lists writes all four deterministic files by default", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-lists-write-"))
  try {
    const output: string[] = []
    const exitCode = await assetsCliMain(["lists", "--dir", directory, "--json"], {
      env: cliEnvironment,
      fetcher: async () =>
        envelopeResponseCreate({
          imageList: "image\n",
          videoList: "video\n",
          fontList: "font\n",
          documentList: "document\n",
          digest: "0".repeat(64),
        }),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { written: true } })
    expect(await readFile(join(directory, "imageList.ts"), "utf8")).toBe("image\n")
    expect(await readFile(join(directory, "videoList.ts"), "utf8")).toBe("video\n")
    expect(await readFile(join(directory, "fontList.ts"), "utf8")).toBe("font\n")
    expect(await readFile(join(directory, "documentList.ts"), "utf8")).toBe("document\n")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("diff integrates authenticated paginated history, categories, exact eligibility, and stable JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "matching.jpg"), "matching")
    await writeFile(join(root, "images", "changed.jpg"), "changed locally")
    await writeFile(join(root, "images", "new.jpg"), "new")
    await writeFile(join(root, "images", "unsupported.bin"), "unsupported")
    const matchingBytes = new TextEncoder().encode("matching")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const changed = assetCreate({ id: "asset-changed", filename: "changed.jpg", sha256: "c".repeat(64), byteSize: 7 })
    const remoteOnly = assetCreate({
      id: "asset-remote",
      filename: "remote-only.jpg",
      sha256: "d".repeat(64),
      byteSize: 1,
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        return envelopeResponseCreate(
          url.searchParams.has("cursor")
            ? { assets: [remoteOnly], page: { limit: 100, nextCursor: null } }
            : { assets: [changed, matching], page: { limit: 100, nextCursor: "1" } },
        )
      }
      if (url.pathname.endsWith("/source-revisions/asset-matching/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-matching"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const environment = { ...cliEnvironment, ASSETS_ENVIRONMENT: "development" }
    const output: string[] = []
    const args = ["diff", root, "--environment", "production", "--json"]
    const firstExitCode = await assetsCliMain(args, {
      env: environment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    const firstJson = output[0]
    expect(firstExitCode).toBe(1)
    expect(output).toHaveLength(1)
    expect(firstJson).toBeDefined()
    expect(JSON.parse(firstJson ?? "")).toEqual({
      ok: true,
      data: {
        altUpdatesPending: 0,
        entries: [
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "changed.jpg",
            reason: "The source fingerprint differs",
            sourcePath: "images/changed.jpg",
            status: "changed",
          },
          {
            class: "image",
            deletionEligible: true,
            logicalPath: "matching.jpg",
            sourcePath: "images/matching.jpg",
            status: "matching",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "new.jpg",
            sourcePath: "images/new.jpg",
            status: "new",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "remote-only.jpg",
            sourcePath: "remote-only.jpg",
            status: "remote-only",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "unsupported.bin",
            reason: "The image file extension is not supported: unsupported.bin",
            sourcePath: "images/unsupported.bin",
            status: "unsupported",
          },
        ],
        environment: "production",
        root,
      },
    })
    expect(output[0]).toBe(firstJson)
    const assetsRequests = requests.filter((request) => new URL(request.url).pathname.endsWith("/assets"))
    expect(assetsRequests.map((request) => new URL(request.url).search)).toEqual([
      "?include=history%2Cmetadata&limit=100",
      "?cursor=1&include=history%2Cmetadata&limit=100",
    ])
    const eligibilityRequests = requests.filter((request) => request.url.includes("deletion-eligibility"))
    expect(eligibilityRequests).toHaveLength(1)
    expect(new URL(eligibilityRequests[0]!.url).search).toBe("?environment=production")
    expect(requests.every((request) => request.headers.get("authorization") === "Bearer service-token")).toBe(true)

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(args, {
      env: environment,
      fetcher,
      stdout: (text) => secondOutput.push(text),
      stderr: () => undefined,
    })
    expect(secondExitCode).toBe(1)
    expect(secondOutput).toEqual(output)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff reports local sidecar alt drift separately from byte changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "hero.jpg"), "hero")
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const bytes = new TextEncoder().encode("hero")
    const remote = assetCreate({
      id: "asset-hero",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root, "--json"], {
      env: cliEnvironment,
      fetcher: async (input) => {
        if (!new URL(input).pathname.endsWith("/assets")) throw new Error(`Unexpected request ${input}`)
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        altUpdatesPending: 1,
        entries: [
          {
            altChanged: true,
            class: "image",
            deletionEligible: false,
            localAlt: "Local alt",
            logicalPath: "hero.jpg",
            reason: "The local sidecar alt differs from remote metadata",
            remoteAlt: "Remote alt",
            sourcePath: "images/hero.jpg",
            status: "metadata",
          },
        ],
        environment: "development",
        root,
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff applies configured source roots and command-line directory overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-flags-"))
  try {
    await mkdir(join(root, "configured-images"), { recursive: true })
    await mkdir(join(root, "override-images"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await mkdir(join(root, "custom-fonts"), { recursive: true })
    await writeFile(
      join(root, "assets.config.json"),
      JSON.stringify({ image: "configured-images", document: "documents" }),
    )
    await writeFile(join(root, "configured-images", "ignored.jpg"), "ignored")
    await writeFile(join(root, "override-images", "used.jpg"), "used")
    await writeFile(join(root, "documents", "ignored.txt"), "ignored")
    await writeFile(join(root, "custom-fonts", "used.woff2"), "font")
    const output: string[] = []
    const exitCode = await assetsCliMain(
      [
        "diff",
        root,
        "--image-dir",
        "override-images",
        "--no-video-dir",
        "--no-document-dir",
        "--font-dir",
        "custom-fonts",
        "--json",
      ],
      {
        env: cliEnvironment,
        fetcher: async (input) => {
          if (!new URL(input).pathname.endsWith("/assets")) throw new Error(`Unexpected request ${input}`)
          return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )
    expect(exitCode).toBe(1)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { class: "font", logicalPath: "used.woff2", sourcePath: "custom-fonts/used.woff2", status: "new" },
          { class: "image", logicalPath: "used.jpg", sourcePath: "override-images/used.jpg", status: "new" },
        ],
      },
    })
    expect(JSON.parse(output[0] ?? "").data.entries).toHaveLength(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff scans configured roots for every class and honors override and disable flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-roots-"))
  try {
    const configured = {
      image: "configured-images",
      video: "configured-videos",
      document: "configured-documents",
      font: "configured-fonts",
    }
    for (const directory of Object.values(configured)) await mkdir(join(root, directory), { recursive: true })
    await mkdir(join(root, "override-images"), { recursive: true })
    await mkdir(join(root, "override-documents"), { recursive: true })
    await writeFile(join(root, "assets.config.json"), JSON.stringify(configured))
    await writeFile(join(root, configured.image, "image.jpg"), "image")
    await writeFile(join(root, configured.video, "video.mp4"), "video")
    await writeFile(join(root, configured.document, "document.txt"), "document")
    await writeFile(join(root, configured.font, "font.woff2"), "font")
    await writeFile(join(root, "override-images", "override.jpg"), "override")
    await writeFile(join(root, "override-documents", "override.txt"), "override")

    const fetcher = async () => envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
    const configuredOutput: string[] = []
    expect(
      await assetsCliMain(["diff", root, "--json"], {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => configuredOutput.push(text),
        stderr: () => undefined,
      }),
    ).toBe(1)
    expect(JSON.parse(configuredOutput[0] ?? "").data.entries).toEqual([
      {
        class: "document",
        deletionEligible: false,
        logicalPath: "document.txt",
        sourcePath: "configured-documents/document.txt",
        status: "new",
      },
      {
        class: "font",
        deletionEligible: false,
        logicalPath: "font.woff2",
        sourcePath: "configured-fonts/font.woff2",
        status: "new",
      },
      {
        class: "image",
        deletionEligible: false,
        logicalPath: "image.jpg",
        sourcePath: "configured-images/image.jpg",
        status: "new",
      },
      {
        class: "video",
        deletionEligible: false,
        logicalPath: "video.mp4",
        sourcePath: "configured-videos/video.mp4",
        status: "new",
      },
    ])

    const overrideOutput: string[] = []
    expect(
      await assetsCliMain(
        [
          "diff",
          root,
          "--image-dir",
          "override-images",
          "--no-video-dir",
          "--document-dir",
          "override-documents",
          "--no-font-dir",
          "--json",
        ],
        {
          env: cliEnvironment,
          fetcher,
          stdout: (text) => overrideOutput.push(text),
          stderr: () => undefined,
        },
      ),
    ).toBe(1)
    expect(JSON.parse(overrideOutput[0] ?? "").data.entries).toEqual([
      {
        class: "document",
        deletionEligible: false,
        logicalPath: "override.txt",
        sourcePath: "override-documents/override.txt",
        status: "new",
      },
      {
        class: "image",
        deletionEligible: false,
        logicalPath: "override.jpg",
        sourcePath: "override-images/override.jpg",
        status: "new",
      },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff returns deterministic human output and succeeds for matching and empty results", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-clean-"))
  const emptyRoot = await mkdtemp(join(tmpdir(), "assets-cli-diff-empty-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "matching.jpg"), "matching")
    const bytes = new TextEncoder().encode("matching")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
    })
    const fetcher = async (input: string | URL) => {
      const url = new URL(input)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({
          assets: url.pathname.endsWith("/assets") ? [matching] : [],
          page: { limit: 100, nextCursor: null },
        })
      return envelopeResponseCreate(deletionEligibilityCreate("asset-matching"))
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    expect(exitCode).toBe(0)
    expect(output[0]).toBe(
      `Root: ${root}\nEnvironment: development\nmatching image images/matching.jpg deletion-eligible\nSummary: new=0 changed=0 matching=1 remote-only=0 unsupported=0 conflict=0 metadata=0 alt-updates-pending=0\n`,
    )

    const emptyOutput: string[] = []
    const emptyRequests: Request[] = []
    const emptyExitCode = await assetsCliMain(["diff", emptyRoot, "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        emptyRequests.push(request)
        return envelopeResponseCreate(
          new URL(request.url).searchParams.has("cursor")
            ? { assets: [], page: { limit: 100, nextCursor: null } }
            : { assets: [], page: { limit: 100, nextCursor: "1" } },
        )
      },
      stdout: (text) => emptyOutput.push(text),
      stderr: () => undefined,
    })
    expect(emptyExitCode).toBe(0)
    expect(emptyRequests.map((request) => new URL(request.url).search)).toEqual([
      "?include=history%2Cmetadata&limit=100",
      "?cursor=1&include=history%2Cmetadata&limit=100",
    ])
    expect(JSON.parse(emptyOutput[0] ?? "")).toEqual({
      ok: true,
      data: { entries: [], environment: "development", root: emptyRoot, altUpdatesPending: 0 },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(emptyRoot, { recursive: true, force: true })
  }
})

test("diff human output reports changed, conflict, unsupported, and remote-only entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-human-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await mkdir(join(root, "fonts"), { recursive: true })
    await writeFile(join(root, "images", "changed.jpg"), "changed")
    await writeFile(join(root, "documents", "unsupported.bin"), "unsupported")
    await writeFile(join(root, "fonts", "same.woff"), "same")
    await writeFile(join(root, "fonts", "same.woff2"), "same")
    const remoteChanged = assetCreate({
      id: "asset-changed-human",
      filename: "changed.jpg",
      sha256: "c".repeat(64),
      byteSize: 7,
    })
    const remoteOnly = assetCreate({
      id: "asset-remote-video",
      filename: "remote.mp4",
      class: "video",
      mediaType: "video/mp4",
      sha256: "d".repeat(64),
      byteSize: 1,
    })
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root], {
      env: cliEnvironment,
      fetcher: async () =>
        envelopeResponseCreate({ assets: [remoteChanged, remoteOnly], page: { limit: 100, nextCursor: null } }),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(output[0]).toBe(
      `Root: ${root}
Environment: development
unsupported document documents/unsupported.bin The document file extension is not supported: unsupported.bin
conflict font fonts/same.woff Multiple local files target the same normalized asset
conflict font fonts/same.woff2 Multiple local files target the same normalized asset
changed image images/changed.jpg The source fingerprint differs
remote-only video remote.mp4
Summary: new=0 changed=1 matching=0 remote-only=1 unsupported=1 conflict=2 metadata=0 alt-updates-pending=0
`,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
