import { expect, test } from "bun:test"

import { assetsCliMain } from "../src/entrypoints/assets-cli.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"
import { wranglerProvisioningRun } from "../src/wrangler/wranglerProvisioningRun.js"

const environment: NodeJS.ProcessEnv = {
  ASSETS_API_URL: "https://assets.example.test",
  ASSETS_TOKEN: "service-token",
  ASSETS_PROJECT: "project-1",
  ASSETS_CONFIG_FILE: "/tmp/assets-settings-migration-test-config.json",
  ASSETS_SESSION_FILE: "/tmp/assets-settings-migration-test-session.json",
}

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status, headers: { "content-type": "application/json" } })

const bindingCreate = (input: { bucket: string; prefix: string; publicBaseUrl: string }) => ({
  projectId: "project-1",
  environmentId: "environment-development",
  environment: "development" as const,
  bucket: input.bucket,
  prefix: input.prefix,
  publicBaseUrl: input.publicBaseUrl,
})

const planCreate = (input: { bucket?: string; prefix?: string; publicBaseUrl?: string }) => ({
  sourceBinding: bindingCreate({
    bucket: "source-bucket",
    prefix: "source-prefix",
    publicBaseUrl: "https://source.example.test",
  }),
  targetBinding: bindingCreate({
    bucket: input.bucket ?? "target-bucket",
    prefix: input.prefix ?? "target-prefix",
    publicBaseUrl: input.publicBaseUrl ?? "https://target.example.test",
  }),
  copyRequired: true,
  idempotencyKey: "migration-key",
  idempotency: { existingMigrationId: null, existingMigrationStatus: null, activeMigrationId: null },
})

const migrationCreate = (status: "queued" | "running" | "succeeded" | "failed" | "cancelled") => ({
  id: "migration-1",
  projectId: "project-1",
  environmentId: "environment-development",
  idempotencyKey: "migration-key",
  sourceBinding: bindingCreate({
    bucket: "source-bucket",
    prefix: "source-prefix",
    publicBaseUrl: "https://source.example.test",
  }),
  targetBinding: bindingCreate({
    bucket: "target-bucket",
    prefix: "target-prefix",
    publicBaseUrl: "https://target.example.test",
  }),
  status,
  sourceInventoryFingerprint: null,
  progress: {
    phase: status === "succeeded" ? "completed" : "copying",
    totalObjects: 1,
    discoveredObjects: 1,
    copiedObjects: status === "succeeded" ? 1 : 0,
    verifiedObjects: status === "succeeded" ? 1 : 0,
    totalBytes: 10,
    copiedBytes: status === "succeeded" ? 10 : 0,
    currentObjectKey: status === "succeeded" ? null : "asset.jpg",
  },
  lastError: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  startedAt: status === "queued" ? null : "2026-09-01T00:00:00.000Z",
  completedAt: status === "succeeded" ? "2026-09-01T00:00:01.000Z" : null,
})

const migrationFetcherCreate = (
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" = "queued",
  startStatus = status,
) => {
  const requests: Request[] = []
  const fetcher = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    requests.push(request)
    const path = new URL(request.url).pathname
    if (path.endsWith("/storage-migration/plan")) return envelopeResponseCreate(planCreate({}))
    if (path.endsWith("/storage-migration/start"))
      return envelopeResponseCreate(
        {
          accepted: true,
          migrationId: "migration-1",
          workflowId: "workflow-1",
          migration: migrationCreate(startStatus),
        },
        202,
      )
    if (path.endsWith("/status")) return envelopeResponseCreate(migrationCreate(status))
    throw new Error(`Unexpected request ${path}`)
  }
  return { fetcher, requests }
}

const cliRun = async (
  args: readonly string[],
  fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>,
  options: { runner?: WranglerCommandRunner; sleep?: (milliseconds: number) => Promise<void> } = {},
) => {
  const output: string[] = []
  const exitCode = await assetsCliMain([...args, "--json"], {
    env: environment,
    fetcher,
    ...(options.runner === undefined ? {} : { wranglerRunner: options.runner }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })
  return { exitCode, output: JSON.parse(output[0] ?? "") }
}

test("settings migrate defaults to an API-only JSON plan and derives the public URL from the domain", async () => {
  const transport = migrationFetcherCreate()
  let runnerCalled = false
  const result = await cliRun(
    [
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--custom-domain",
      "cdn.example.test",
      "--zone-id",
      "zone-1",
    ],
    transport.fetcher,
    {
      runner: async () => {
        runnerCalled = true
        throw new Error("dry plans must not run Wrangler")
      },
    },
  )

  expect(result.exitCode).toBe(0)
  expect(runnerCalled).toBe(false)
  expect(transport.requests.map((request) => request.method)).toEqual(["POST"])
  expect(JSON.parse(await transport.requests[0]!.clone().text())).toMatchObject({
    r2Bucket: "target-bucket",
    publicBaseUrl: "https://cdn.example.test",
  })
  expect(result.output).toMatchObject({ ok: true, data: { sourceBinding: { bucket: "source-bucket" } } })
})

test("settings migrate apply provisions with a profile, starts, and waits for completion", async () => {
  const transport = migrationFetcherCreate("succeeded")
  const calls: string[][] = []
  let domainGetCount = 0
  const runner: WranglerCommandRunner = async ({ args }) => {
    calls.push([...args])
    if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "wrangler 4", stderr: "" } }
    if (args[0] === "r2" && args[2] === "info")
      return { success: true, data: { exitCode: 1, stdout: "", stderr: "not found" } }
    if (args[0] === "r2" && args[2] === "create")
      return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    if (args[0] === "r2" && args[3] === "get") {
      domainGetCount += 1
      return {
        success: true,
        data: {
          exitCode: domainGetCount === 1 ? 1 : 0,
          stdout: domainGetCount === 1 ? "" : '{"enabled":true,"status":{"ownership":"active","ssl":"active"}}',
          stderr: domainGetCount === 1 ? "custom domain not found" : "",
        },
      }
    }
    if (args[0] === "r2" && args[3] === "add") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }
  const waits: number[] = []
  const result = await cliRun(
    [
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--create-bucket",
      "--custom-domain",
      "cdn.example.test",
      "--zone-id",
      "zone-1",
      "--wrangler-profile",
      "production",
      "--apply",
      "--wait",
      "--poll-interval",
      "25",
    ],
    transport.fetcher,
    { runner, sleep: async (milliseconds) => void waits.push(milliseconds) },
  )
  expect(result.exitCode).toBe(0)
  expect(calls).toEqual([
    ["--version", "--profile", "production"],
    ["r2", "bucket", "info", "target-bucket", "--json", "--profile", "production"],
    ["r2", "bucket", "create", "target-bucket", "--profile", "production"],
    ["r2", "bucket", "domain", "get", "target-bucket", "--domain", "cdn.example.test", "--profile", "production"],
    [
      "r2",
      "bucket",
      "domain",
      "add",
      "target-bucket",
      "--domain",
      "cdn.example.test",
      "--zone-id",
      "zone-1",
      "--force",
      "--profile",
      "production",
    ],
    ["r2", "bucket", "domain", "get", "target-bucket", "--domain", "cdn.example.test", "--profile", "production"],
  ])
  expect(transport.requests.map((request) => request.method)).toEqual(["POST", "POST", "GET"])
  expect(waits).toEqual([])
  expect(result.output).toMatchObject({
    ok: true,
    data: { migrationId: "migration-1", status: { status: "succeeded" } },
  })
})

test("settings migrate does not create already existing bucket or domain", async () => {
  const transport = migrationFetcherCreate()
  const calls: string[][] = []
  const runner: WranglerCommandRunner = async ({ args }) => {
    calls.push([...args])
    if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "wrangler", stderr: "" } }
    if (args[0] === "r2" && args[2] === "info")
      return { success: true, data: { exitCode: 0, stdout: "{}", stderr: "" } }
    if (args[0] === "r2" && args[3] === "get") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }

  const result = await cliRun(
    [
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--create-bucket",
      "--custom-domain",
      "cdn.example.test",
      "--zone-id",
      "zone-1",
      "--apply",
    ],
    transport.fetcher,
    { runner },
  )

  expect(result.exitCode).toBe(0)
  expect(calls).toHaveLength(3)
  expect(calls.some((args) => args.includes("create"))).toBe(false)
  expect(calls.some((args) => args.includes("add"))).toBe(false)
})

test("settings migrate validates target, domain, and wait relationships before planning", async () => {
  let requestCount = 0
  const fetcher = async () => {
    requestCount += 1
    return envelopeResponseCreate(planCreate({}))
  }
  const run = (args: readonly string[]) => cliRun(args, fetcher)

  await expect(
    run(["settings", "migrate", "--project", "project-1", "--environment", "development", "--create-bucket"]),
  ).resolves.toMatchObject({ exitCode: 1, output: { error: { message: "--create-bucket requires --r2-bucket" } } })
  await expect(
    run([
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--custom-domain",
      "cdn.example.test",
      "--zone-id",
      "zone-1",
      "--public-base-url",
      "https://other.example.test",
    ]),
  ).resolves.toMatchObject({ exitCode: 1, output: { error: { message: expect.stringContaining("must agree") } } })
  await expect(
    run([
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--apply",
      "--wait",
      "--no-wait",
    ]),
  ).resolves.toMatchObject({
    exitCode: 1,
    output: { error: { message: "--wait and --no-wait cannot be used together" } },
  })
  expect(requestCount).toBe(0)
})

test("settings migrate rejects invalid prefixes, extra positionals, and a poll interval without wait", async () => {
  const transport = migrationFetcherCreate()
  let runnerCalled = false
  const runner: WranglerCommandRunner = async () => {
    runnerCalled = true
    throw new Error("Wrangler must not run")
  }
  const run = (args: readonly string[]) => cliRun(args, transport.fetcher, { runner })

  await expect(
    run([
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--r2-prefix",
      "invalid//prefix",
      "--apply",
      "--create-bucket",
    ]),
  ).resolves.toMatchObject({ exitCode: 1, output: { error: { message: "The R2 prefix was invalid" } } })
  await expect(
    run(["settings", "migrate", "unexpected", "--project", "project-1", "--environment", "development"]),
  ).resolves.toMatchObject({
    exitCode: 1,
    output: { error: { message: "The settings migrate command takes no positional arguments" } },
  })
  await expect(
    run([
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--poll-interval",
      "10",
    ]),
  ).resolves.toMatchObject({ exitCode: 1, output: { error: { message: "--poll-interval requires --wait" } } })
  expect(transport.requests).toHaveLength(0)
  expect(runnerCalled).toBe(false)
})

test("settings migrate does not invoke Wrangler when no provisioning flag is requested", async () => {
  const transport = migrationFetcherCreate("queued", "queued")
  let runnerCalled = false
  const result = await cliRun(
    [
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--apply",
    ],
    transport.fetcher,
    {
      runner: async () => {
        runnerCalled = true
        throw new Error("Wrangler must not run")
      },
    },
  )

  expect(result.exitCode).toBe(0)
  expect(runnerCalled).toBe(false)
  expect(result.output).toMatchObject({ data: { provisioning: { wranglerVerified: false } } })
})

test("settings migrate returns nonzero for already terminal failed and cancelled idempotent migrations", async () => {
  for (const status of ["failed", "cancelled"] as const) {
    const transport = migrationFetcherCreate(status, status)
    const result = await cliRun(
      [
        "settings",
        "migrate",
        "--project",
        "project-1",
        "--environment",
        "development",
        "--r2-bucket",
        "target-bucket",
        "--apply",
      ],
      transport.fetcher,
    )

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatchObject({ ok: true, data: { migration: { status }, migrationId: "migration-1" } })
  }
})

test("settings migrate preserves the migration id when status polling fails", async () => {
  const plan = migrationFetcherCreate()
  const fetcher = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    plan.requests.push(request)
    const path = new URL(request.url).pathname
    if (path.endsWith("/storage-migration/plan")) return envelopeResponseCreate(planCreate({}))
    if (path.endsWith("/storage-migration/start"))
      return envelopeResponseCreate(
        {
          accepted: true,
          migrationId: "migration-1",
          workflowId: "workflow-1",
          migration: migrationCreate("queued"),
        },
        202,
      )
    if (path.endsWith("/status"))
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "service_unavailable", message: "Status service unavailable", retryable: true },
          requestId: "status-request",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      )
    throw new Error(`Unexpected request ${path}`)
  }
  const result = await cliRun(
    [
      "settings",
      "migrate",
      "--project",
      "project-1",
      "--environment",
      "development",
      "--r2-bucket",
      "target-bucket",
      "--apply",
      "--wait",
    ],
    fetcher,
  )

  expect(result.exitCode).toBe(1)
  expect(result.output).toEqual({
    error: {
      code: "service_unavailable",
      message: "Status service unavailable",
      details: { migrationId: "migration-1" },
      retryable: true,
    },
    ok: false,
    requestId: "status-request",
  })
  expect(JSON.stringify(result.output)).not.toContain("Wrangler")
})

test("wrangler provisioning reports command errors without returning command output", async () => {
  const result = await wranglerProvisioningRun(
    async () => ({
      success: true,
      data: { exitCode: 1, stdout: "token=secret", stderr: "token=secret" },
    }),
    {
      bucket: "target-bucket",
      createBucket: true,
    },
  )

  expect(result).toEqual({
    success: false,
    op: "wranglerProvisioningRun",
    errorMessage: "Wrangler version check exited with code 1",
  })
  expect(JSON.stringify(result)).not.toContain("secret")
})

test("wrangler provisioning creates only for an actual missing bucket", async () => {
  const calls: string[][] = []
  const result = await wranglerProvisioningRun(
    async ({ args }) => {
      calls.push([...args])
      if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      if (args[2] === "info")
        return {
          success: true,
          data: { exitCode: 1, stdout: "", stderr: "The specified bucket does not exist. [code: 10006]" },
        }
      if (args[2] === "create") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
    },
    { bucket: "target-bucket", createBucket: true },
  )

  expect(result).toEqual({
    success: true,
    data: { wranglerVerified: true, bucket: { name: "target-bucket", created: true } },
  })
  expect(calls.some((args) => args.includes("create"))).toBe(true)
})

test("wrangler provisioning does not create a bucket after an auth or service lookup error", async () => {
  for (const stderr of [
    "Authentication error: invalid API token",
    "The Cloudflare API returned 503 Service Unavailable",
  ]) {
    const calls: string[][] = []
    const result = await wranglerProvisioningRun(
      async ({ args }) => {
        calls.push([...args])
        if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
        return { success: true, data: { exitCode: 1, stdout: "secret-output", stderr } }
      },
      { bucket: "target-bucket", createBucket: true },
    )

    expect(result.success).toBe(false)
    if (result.success) continue
    expect(result.errorMessage).toMatch(stderr.includes("Authentication") ? /authentication/u : /unavailable/u)
    expect(calls.some((args) => args.includes("create"))).toBe(false)
    expect(JSON.stringify(result)).not.toContain("secret-output")
  }
})

test("wrangler provisioning reports disabled or pending domains as unverified", async () => {
  const calls: string[][] = []
  const result = await wranglerProvisioningRun(
    async ({ args }) => {
      calls.push([...args])
      if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      if (args[3] === "get")
        return {
          success: true,
          data: {
            exitCode: 0,
            stdout: '{"domain":"cdn.example.test","enabled":false,"status":{"ownership":"active","ssl":"active"}}',
            stderr: "",
          },
        }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
    },
    { bucket: "target-bucket", createBucket: false, customDomain: "cdn.example.test", zoneId: "zone-1" },
  )

  expect(result).toEqual({
    success: true,
    data: {
      wranglerVerified: true,
      customDomain: { name: "cdn.example.test", attached: true, verified: false },
    },
  })
  expect(calls.some((args) => args.includes("add"))).toBe(false)
})

test("wrangler provisioning distinguishes an absent domain from an absent bucket", async () => {
  const domainMissingCalls: string[][] = []
  let domainGetCount = 0
  const domainMissing = await wranglerProvisioningRun(
    async ({ args }) => {
      domainMissingCalls.push([...args])
      if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      if (args[3] === "get") {
        domainGetCount += 1
        return domainGetCount === 1
          ? { success: true, data: { exitCode: 1, stdout: "", stderr: "custom domain not found" } }
          : { success: true, data: { exitCode: 0, stdout: '{"enabled":true,"status":"active"}', stderr: "" } }
      }
      if (args[3] === "add") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
    },
    { bucket: "target-bucket", createBucket: false, customDomain: "cdn.example.test", zoneId: "zone-1" },
  )
  expect(domainMissing).toMatchObject({ success: true, data: { customDomain: { attached: true, verified: true } } })
  expect(domainMissingCalls.some((args) => args.includes("add"))).toBe(true)

  const bucketMissing = await wranglerProvisioningRun(
    async ({ args }) => {
      if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      return {
        success: true,
        data: { exitCode: 1, stdout: "", stderr: "The specified bucket does not exist. [code: 10006]" },
      }
    },
    { bucket: "target-bucket", createBucket: false, customDomain: "cdn.example.test", zoneId: "zone-1" },
  )
  expect(bucketMissing).toEqual({
    success: false,
    op: "wranglerProvisioningRun",
    errorMessage: "The target R2 bucket was not found",
  })
})
