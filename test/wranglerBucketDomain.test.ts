import { expect, test } from "bun:test"

import { wranglerBucketDomainDelete } from "../src/wrangler/wranglerBucketDomainDelete.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"

test("wrangler bucket domain delete removes and verifies a custom domain with request credentials", async () => {
  const calls: Array<{ args: string[]; accountId?: string; apiToken?: string }> = []
  let attached = true
  const runner: WranglerCommandRunner = async ({ args, accountId, apiToken }) => {
    calls.push({ args: [...args], accountId, apiToken })
    if (args[3] === "get")
      return attached
        ? { success: true, data: { exitCode: 0, stdout: "{}", stderr: "" } }
        : { success: true, data: { exitCode: 1, stdout: "", stderr: "custom domain not found" } }
    attached = false
    return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
  }

  const result = await wranglerBucketDomainDelete(runner, {
    bucket: "project-bucket",
    customDomain: "assets.example.test",
    accountId: "account-1",
    apiToken: "request-token",
  })

  expect(result).toEqual({ success: true, data: { name: "assets.example.test", deleted: true } })
  expect(calls).toEqual([
    {
      args: ["r2", "bucket", "domain", "get", "project-bucket", "--domain", "assets.example.test"],
      accountId: "account-1",
      apiToken: "request-token",
    },
    {
      args: ["r2", "bucket", "domain", "remove", "project-bucket", "--domain", "assets.example.test"],
      accountId: "account-1",
      apiToken: "request-token",
    },
    {
      args: ["r2", "bucket", "domain", "get", "project-bucket", "--domain", "assets.example.test"],
      accountId: "account-1",
      apiToken: "request-token",
    },
  ])
})
