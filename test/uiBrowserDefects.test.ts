import { mkdir, rm } from "node:fs/promises"

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"
import { assetsApiResultOptionalRead } from "../src/api-client/assetsApiResultOptionalRead.js"
import { fixtureServerCreate } from "../src/fixture/fixtureServerCreate.js"
import type { FixtureServer } from "../src/fixture/fixtureServerCreate.js"
import { uiStatusToneClassesRead } from "../src/ui/common/uiStatusToneClassesRead.js"
import { uiDeletionProgressRead } from "../src/ui/deletion/uiDeletionProgressRead.js"
import { workflowJobIdCreate } from "../src/workflow/workflowJobIdCreate.js"

const origin = "http://127.0.0.1:3021"
// A 4x4 red PNG, small enough to inline and real enough for media-type sniffing.
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAABlBMVEX/AAD///9BHTQRAAAAAWJLR0QB/wIt3gAAAAtJREFUCNdjYIAAAAAIAAEvIN0xAAAAAElFTkSuQmCC"
const databasePath = `data/fixture-defects-${crypto.randomUUID()}.sqlite`

let server: FixtureServer
let cookie: string
let client: Extract<ReturnType<typeof assetsApiClientCreate>, { success: true }>["data"]

beforeAll(async () => {
  await mkdir("data", { recursive: true })
  const created = fixtureServerCreate({ databasePath, origin })
  if (!created.success) throw new Error(created.errorMessage)
  server = created.data
  const session = await server.sessionCookieRead()
  if (!session.success) throw new Error(session.errorMessage)
  cookie = session.data.split(";")[0] ?? ""
  const built = assetsApiClientCreate({
    apiUrl: origin,
    sessionCookie: cookie,
    fetcher: (input, init) => server.fetch(new Request(String(input), init)),
  })
  if (!built.success) throw new Error(built.errorMessage)
  client = built.data
})

afterAll(async () => {
  server.close()
  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
})

describe("metadata alt parsing", () => {
  test("parses the asset detail returned by an alt set and unset", async () => {
    const set = await client.assetMetadataSet(server.seed.serviceProjectId, "asset-hero", { alt: "A new alt text" })
    expect(set.success).toBe(true)
    if (!set.success) return
    expect(set.data.sourcePath.length).toBeGreaterThan(0)
    expect(set.data.metadata?.metadata).toMatchObject({ alt: "A new alt text" })

    const unset = await client.assetMetadataUnset(server.seed.serviceProjectId, "asset-hero", { field: "alt" })
    expect(unset.success).toBe(true)
    if (!unset.success) return
    expect(unset.data.metadata?.metadata).toMatchObject({ alt: null })
  })
})

describe("jobs API", () => {
  test("lists jobs and workflows after an output-set change created new jobs", async () => {
    const replaced = await client.assetOutputsSet(server.seed.serviceProjectId, "asset-hero", {
      outputs: [
        { kind: "image", key: "1200x675_webp", width: 1200, height: 675, format: "webp", quality: 80 },
        { kind: "image", key: "600x338_webp", width: 600, height: 338, format: "webp", quality: 80 },
      ],
    })
    expect(replaced.success).toBe(true)

    const jobs = await client.jobListRead(server.seed.serviceProjectId, { limit: 100 })
    expect(jobs.success).toBe(true)
    if (!jobs.success) return
    expect(jobs.data.jobs.length).toBeGreaterThan(1)
    expect(jobs.data.jobs.every((job) => job.id.length <= 128)).toBe(true)
  })

  test("retries a dead job and reports a conflict for a job that did not fail", async () => {
    const retried = await client.jobRetry(server.seed.serviceProjectId, "job-workflow-inter")
    expect(retried.success).toBe(true)
    if (!retried.success) return
    expect(retried.data.job.status).toBe("queued")

    const conflict = await client.jobRetry(server.seed.serviceProjectId, "job-workflow-inter")
    expect(conflict.success).toBe(false)
    if (conflict.success) return
    expect(conflict.errorMessage).toContain("Only failed jobs")
  })
})

describe("workflowJobIdCreate", () => {
  test("keeps generated job identifiers inside the identifier limit", () => {
    const workflowId = `workflow-output-${"a".repeat(64)}`
    const id = workflowJobIdCreate(workflowId, `output-output-${"b".repeat(64)}`)
    expect(id.length).toBeLessThanOrEqual(128)
    expect(id).not.toBe(workflowJobIdCreate(workflowId, `output-output-${"c".repeat(64)}`))
  })

  test("leaves a short identifier unchanged", () => {
    expect(workflowJobIdCreate("workflow-1", "verify")).toBe("workflow-1-verify")
  })
})

describe("expected absences", () => {
  test("reads an absent production catalog as null instead of a failure", async () => {
    const catalog = await client.catalogCurrentOptionalRead(server.seed.serviceProjectId, "production")
    expect(catalog).toEqual({ success: true, data: null })
  })

  test("reads an absent deletion request as null instead of a failure", async () => {
    const deletion = await client.deletionStatusOptionalRead(server.seed.serviceProjectId, "asset-intro")
    expect(deletion).toEqual({ success: true, data: null })
  })

  test("answers an absent deletion with 200 and null, so browsing produces no 404 traffic", async () => {
    const response = await server.fetch(
      new Request(`${origin}/api/v1/projects/${server.seed.serviceProjectId}/assets/asset-intro/deletion-status`, {
        headers: { accept: "application/json", cookie },
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, data: null })

    const direct = await client.deletionStatusRead(server.seed.serviceProjectId, "asset-intro")
    expect(direct).toEqual({ success: true, data: null })
  })

  test("answers the deletion aliases the same way", async () => {
    for (const path of ["deletion", "deletion-request"]) {
      const response = await server.fetch(
        new Request(`${origin}/api/v1/projects/${server.seed.serviceProjectId}/assets/asset-intro/${path}`, {
          headers: { accept: "application/json", cookie },
        }),
      )
      expect(response.status).toBe(200)
    }
  })

  test("keeps a real failure as a failure", () => {
    const failed = assetsApiResultOptionalRead({
      success: false,
      op: "test",
      errorMessage: "boom",
      rawData: { status: 500 },
    })
    expect(failed.success).toBe(false)
  })
})

describe("fixture signed uploads", () => {
  test("points the upload intent at the fixture origin and accepts preflight and PUT", async () => {
    const bytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0))
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
    const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")

    const intent = await client.uploadIntentCreate(server.seed.serviceProjectId, {
      originalFilename: "upload.png",
      folders: ["home"],
      integrationNote: "Browser upload check",
      byteSize: bytes.byteLength,
      mediaType: "image/png",
      sha256,
    })
    expect(intent.success).toBe(true)
    if (!intent.success) return
    expect(new URL(intent.data.intent.url).origin).toBe(origin)

    const preflight = await server.fetch(
      new Request(intent.data.intent.url, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "PUT" },
      }),
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin)

    const put = await server.fetch(
      new Request(intent.data.intent.url, {
        method: "PUT",
        headers: { ...intent.data.intent.headers, origin },
        body: bytes,
      }),
    )
    expect(put.status).toBe(200)

    const completed = await client.uploadCompletionComplete(server.seed.serviceProjectId, intent.data.uploadId, {
      sha256,
    })
    if (!completed.success) throw new Error(`${completed.errorMessage} ${JSON.stringify(completed.rawData)}`)
    expect(completed.success).toBe(true)
    expect(completed.data.status).toBe("accepted")
  })
})

describe("status badge contrast", () => {
  test("uses dark filled backgrounds on light text instead of the low-contrast library variants", () => {
    expect(uiStatusToneClassesRead("positive")).toContain("bg-green-800")
    expect(uiStatusToneClassesRead("negative")).toContain("bg-red-800")
    expect(uiStatusToneClassesRead("positive")).not.toContain("green-500")
  })
})

describe("unsupported upload media types", () => {
  test("refuses an SVG intent with 400 and a message naming the supported types", async () => {
    const response = await server.fetch(
      new Request(`${origin}/api/v1/projects/${server.seed.serviceProjectId}/uploads/intent`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          originalFilename: "logo.svg",
          folders: ["brand"],
          integrationNote: "Header logo",
          byteSize: 512,
          mediaType: "image/svg+xml",
        }),
      }),
    )
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("validation_failed")
    expect(body.error?.message).toContain("image/svg+xml is not allowed")
  })

  test("never answers an SVG upload attempt with 500", async () => {
    const attempt = await client.uploadIntentCreate(server.seed.serviceProjectId, {
      originalFilename: "logo.svg",
      folders: ["brand"],
      integrationNote: "Header logo",
      byteSize: 512,
      mediaType: "image/svg+xml",
    })
    expect(attempt.success).toBe(false)
    if (attempt.success) return
    expect((attempt.rawData as { status?: number } | undefined)?.status).not.toBe(500)
  })
})

describe("seeded retry targets", () => {
  test("seeds two failed workflows whose jobs do not overlap", async () => {
    const workflows = await client.workflowListRead(server.seed.serviceProjectId, { limit: 100 })
    expect(workflows.success).toBe(true)
    if (!workflows.success) return
    const statuses = new Map(workflows.data.workflows.map((workflow) => [workflow.id, workflow.status]))
    expect(statuses.get(server.seed.failedWorkflowId)).toBe("failed")
    expect(statuses.get(server.seed.retryableWorkflowId)).toBe("failed")
    expect(server.seed.failedWorkflowId).not.toBe(server.seed.retryableWorkflowId)

    const jobs = await client.jobListRead(server.seed.serviceProjectId, { limit: 100 })
    expect(jobs.success).toBe(true)
    if (!jobs.success) return
    const dead = jobs.data.jobs.find((job) => job.id === server.seed.deadJobId)
    const retryable = jobs.data.jobs.find((job) => job.id === server.seed.retryableJobId)
    expect(dead?.status).toBe("dead")
    expect(retryable?.status).toBe("retryable")
    expect(dead?.workflowId).not.toBe(server.seed.retryableWorkflowId)
  })

  test("retries the seeded dead job and queues it deterministically", async () => {
    const retried = await client.jobRetry(server.seed.serviceProjectId, server.seed.deadJobId)
    expect(retried.success).toBe(true)
    if (!retried.success) return
    expect(retried.data.job.status).toBe("queued")
    expect(retried.data.job.attempts).toBe(0)
    expect(retried.data.job.error ?? null).toBeNull()
  })

  test("retries the seeded failed workflow and queues all of its failed jobs", async () => {
    const retried = await client.workflowRetry(server.seed.serviceProjectId, server.seed.retryableWorkflowId)
    expect(retried.success).toBe(true)
    if (!retried.success) return
    expect(retried.data.workflow.status).toBe("queued")
    expect(retried.data.jobs.every((job) => job.status === "queued")).toBe(true)
  })

  test("leaves both workflows queued, so neither retry consumed the other", async () => {
    const workflows = await client.workflowListRead(server.seed.serviceProjectId, { limit: 100 })
    expect(workflows.success).toBe(true)
    if (!workflows.success) return
    const statuses = new Map(workflows.data.workflows.map((workflow) => [workflow.id, workflow.status]))
    expect(statuses.get(server.seed.failedWorkflowId)).toBe("queued")
    expect(statuses.get(server.seed.retryableWorkflowId)).toBe("queued")
  })
})

describe("unauthenticated deep links", () => {
  test("carries the full path and query through login back to the requested page", async () => {
    const deepLink = "/projects/contentoren/assets/asset-hero?dialog=outputs&cursor=40"
    const response = await server.fetch(
      new Request(`${origin}/api/v1/auth/login?returnTo=${encodeURIComponent(deepLink)}`, {
        headers: { accept: "application/json" },
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data?: { authorizationUrl?: string } }
    const url = new URL(String(body.data?.authorizationUrl))
    expect(`${url.pathname}${url.search}`).toBe(deepLink)
  })

  test("redirects the browser flow to the same deep link", async () => {
    const deepLink = "/projects/contentoren/jobs?tab=jobs"
    const response = await server.fetch(
      new Request(`${origin}/api/v1/auth/login?returnTo=${encodeURIComponent(deepLink)}`, { redirect: "manual" }),
    )
    expect(response.status).toBe(302)
    const location = new URL(String(response.headers.get("location")))
    expect(`${location.pathname}${location.search}`).toBe(deepLink)
  })
})

describe("seeded deletion progress", () => {
  test("exposes a half-finished deletion with both step and remote-object counts", async () => {
    const state = await client.deletionStatusRead(server.seed.serviceProjectId, server.seed.partialDeletionAssetId)
    expect(state.success).toBe(true)
    if (!state.success || state.data === null) return
    expect(state.data.status).toBe("in_progress")
    expect(state.data.completedSteps.length).toBeGreaterThan(0)
    expect(state.data.pendingRemoteObjects.length).toBeGreaterThan(0)

    const progress = uiDeletionProgressRead(state.data)
    expect(progress.completedSteps).toBeGreaterThan(0)
    expect(progress.completedSteps).toBeLessThan(progress.totalSteps)
    expect(progress.pendingObjects).toBe(state.data.pendingRemoteObjects.length)
    expect(progress.label).toContain("remote objects removed")
  })
})

describe("deletion request marking", () => {
  test("reports `requested`, not a completed deletion, and marks the asset in the list", async () => {
    const requested = await client.assetDeleteRequest(server.seed.serviceProjectId, "asset-intro")
    expect(requested.success).toBe(true)
    if (!requested.success) return
    expect(requested.data.status).toBe("requested")

    const state = await client.deletionStatusOptionalRead(server.seed.serviceProjectId, "asset-intro")
    expect(state.success).toBe(true)
    if (!state.success || state.data === null) return
    expect(state.data.status).toBe("requested")
    expect(state.data.completedAt).toBeUndefined()

    const list = await client.assetListRead(server.seed.serviceProjectId, { limit: 100 })
    expect(list.success).toBe(true)
    if (!list.success) return
    const marked = list.data.assets.find((asset) => asset.id === "asset-intro")
    expect(marked?.deletionStatus).toBe("requested")
    const untouched = list.data.assets.find((asset) => asset.id === "asset-hero")
    expect(untouched?.deletionStatus).toBeUndefined()
  })
})
