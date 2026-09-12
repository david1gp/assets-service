import { expect, test } from "bun:test"

import type { StorageBinding } from "../src/storage/storageBindingSchema.js"
import { wranglerBucketCreate } from "../src/wrangler/wranglerBucketCreate.js"
import { wranglerBucketDelete } from "../src/wrangler/wranglerBucketDelete.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"

const bindingCreate = (projectId: string, bucket: string): StorageBinding => ({
  projectId,
  environment: "production",
  bucket,
  prefix: `projects/${projectId}`,
  publicBaseUrl: "https://assets.example.test",
})

test("wrangler bucket create reuses idempotent provisioning and preserves the profile", async () => {
  const calls: string[][] = []
  const runner: WranglerCommandRunner = async ({ args }) => {
    calls.push([...args])
    if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    if (args[2] === "info")
      return { success: true, data: { exitCode: 1, stdout: "", stderr: "bucket does not exist [code: 10006]" } }
    if (args[2] === "create") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }

  const result = await wranglerBucketCreate(runner, { bucket: "dedicated-bucket", profile: "production" })

  expect(result).toEqual({ success: true, data: { name: "dedicated-bucket", created: true } })
  expect(calls).toContainEqual(["r2", "bucket", "create", "dedicated-bucket", "--profile", "production"])
})

test("wrangler bucket delete refuses shared buckets before invoking Wrangler", async () => {
  let called = false
  const runner: WranglerCommandRunner = async () => {
    called = true
    throw new Error("shared buckets must not be deleted")
  }

  const result = await wranglerBucketDelete(runner, {
    bucket: "shared-bucket",
    projectId: "project-1",
    bindings: [bindingCreate("project-1", "shared-bucket"), bindingCreate("project-2", "shared-bucket")],
  })

  expect(result).toMatchObject({ success: false, errorMessage: "The bucket is shared with another project" })
  expect(called).toBe(false)
})

test("wrangler bucket delete checks dedication, supports profiles, and treats a missing bucket as idempotent", async () => {
  const calls: string[][] = []
  const runner: WranglerCommandRunner = async ({ args }) => {
    calls.push([...args])
    if (args[2] === "info")
      return {
        success: true,
        data: { exitCode: 1, stdout: "", stderr: "The specified bucket does not exist. [code: 10006]" },
      }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }

  const result = await wranglerBucketDelete(runner, {
    bucket: "dedicated-bucket",
    projectId: "project-1",
    bindings: [bindingCreate("project-1", "dedicated-bucket")],
    profile: "production",
  })

  expect(result).toEqual({ success: true, data: { name: "dedicated-bucket", deleted: false } })
  expect(calls).toEqual([["r2", "bucket", "info", "dedicated-bucket", "--json", "--profile", "production"]])
})

test("wrangler bucket delete deletes a proven dedicated bucket", async () => {
  const calls: string[][] = []
  let bucketExists = true
  const runner: WranglerCommandRunner = async ({ args }) => {
    calls.push([...args])
    if (args[2] === "info")
      return bucketExists
        ? { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
        : { success: true, data: { exitCode: 1, stdout: "", stderr: "bucket does not exist [code: 10006]" } }
    bucketExists = false
    return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
  }

  const result = await wranglerBucketDelete(runner, {
    bucket: "dedicated-bucket",
    projectId: "project-1",
    bindings: [bindingCreate("project-1", "dedicated-bucket")],
  })

  expect(result).toEqual({ success: true, data: { name: "dedicated-bucket", deleted: true } })
  expect(calls).toEqual([
    ["r2", "bucket", "info", "dedicated-bucket", "--json"],
    ["r2", "bucket", "delete", "dedicated-bucket", "--force"],
    ["r2", "bucket", "info", "dedicated-bucket", "--json"],
  ])
})
