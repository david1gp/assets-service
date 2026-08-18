import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assetsCliMain } from "../src/entrypoints/assets-cli.js"

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data, requestId: "request-1" }), {
    status,
    headers: { "content-type": "application/json" },
  })

const cliEnvironment = {
  ASSETS_API_URL: "https://assets.example.test",
  ASSETS_TOKEN: "service-token",
  ASSETS_PROJECT: "project-1",
  ASSETS_ENVIRONMENT: "development",
  ASSETS_CONFIG_FILE: join(tmpdir(), "assets-cli-test-missing-config.json"),
  ASSETS_SESSION_FILE: join(tmpdir(), "assets-cli-test-missing-session.json"),
}

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
  const output: string[] = []

  const exitCode = await assetsCliMain(["lists", "--check", "--dir", directory, "--json"], {
    env: cliEnvironment,
    fetcher: async () => envelopeResponseCreate({ imageList: "", videoList: "", fontList: "", digest: "0".repeat(64) }),
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

test("remote lists writes all three deterministic files by default", async () => {
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
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
