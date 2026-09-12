import { expect, test } from "bun:test"

import { assetsCliMain } from "../src/entrypoints/assets-cli.js"

const environment = {
  ASSETS_API_URL: "https://assets.example.test",
  ASSETS_TOKEN: "service-token",
  ASSETS_CONFIG_FILE: "/tmp/assets-backfill-missing-config.json",
  ASSETS_SESSION_FILE: "/tmp/assets-backfill-missing-session.json",
  CLOUDFLARE_ACCOUNT_ID: "account-1",
  CLOUDFLARE_API_TOKEN: "request-token",
}

test("R2 credential backfill CLI reads Cloudflare inputs from the selected environment", async () => {
  let request: Request | undefined
  const output: string[] = []
  const exitCode = await assetsCliMain(["r2", "credentials", "backfill", "--dry-run", "--json"], {
    env: environment,
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            dryRun: true,
            discoveredBuckets: ["bucket"],
            plannedBuckets: ["bucket"],
            createdBuckets: [],
            skippedBuckets: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(request?.url).toBe("https://assets.example.test/api/v1/operations/r2-bucket-credentials/backfill")
  expect(await request?.clone().json()).toEqual({ accountId: "account-1", apiToken: "request-token", dryRun: true })
  expect(output.join("\n")).not.toContain("request-token")
})

test("R2 credential backfill CLI rejects missing Cloudflare inputs before the API request", async () => {
  let requestCount = 0
  const errors: string[] = []
  const exitCode = await assetsCliMain(["r2", "credentials", "backfill", "--dry-run"], {
    env: { ...environment, CLOUDFLARE_API_TOKEN: undefined },
    fetcher: async () => {
      requestCount += 1
      return new Response("unexpected", { status: 500 })
    },
    stdout: () => undefined,
    stderr: (text) => errors.push(text),
  })

  expect(exitCode).toBe(1)
  expect(requestCount).toBe(0)
  expect(errors.join("\n")).toContain("CLOUDFLARE_API_TOKEN")
})

test("R2 credential backfill CLI redacts the request token from API failures", async () => {
  const errors: string[] = []
  const exitCode = await assetsCliMain(["r2", "credentials", "backfill", "--dry-run"], {
    env: environment,
    fetcher: async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "internal_error",
            message: "Authorization: Bearer request-token; secretAccessKey: generated-secret",
            retryable: true,
          },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    stdout: () => undefined,
    stderr: (text) => errors.push(text),
  })

  expect(exitCode).toBe(1)
  expect(errors.join("\n")).not.toContain("request-token")
  expect(errors.join("\n")).not.toContain("generated-secret")
})
