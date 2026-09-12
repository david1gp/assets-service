import { expect, test } from "bun:test"

import { r2BucketCredentialRepairCreate } from "../src/r2/r2BucketCredentialRepairCreate.js"
import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredential } from "../src/r2/r2BucketCredentialSchema.js"
import type { StorageBinding } from "../src/storage/storageBindingSchema.js"

const requestCredentials = { accountId: "account-1", apiToken: "request-token" }

const bindingCreate = (bucket: string): StorageBinding => ({
  projectId: "project-1",
  environment: "production",
  bucket,
  prefix: "project-1",
  publicBaseUrl: "https://assets.example.test",
})

const credentialCreate = (
  bucket: string,
  suffix: string,
  revocationId = `revocation-${suffix}`,
): R2BucketCredential => ({
  bucket,
  accessKeyId: `access-key-${suffix}`,
  secretAccessKey: `secret-key-${suffix}`,
  revocationId,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
})

const credentialInputCreate = (bucket: string, suffix: string): R2BucketCredentialCreateInput => ({
  bucket,
  accessKeyId: `access-key-${suffix}`,
  secretAccessKey: `secret-key-${suffix}`,
  revocationId: `revocation-${suffix}`,
})

test("repairs distinct live buckets through persisted credentials and skips them on retry", async () => {
  const credentials = new Map<string, R2BucketCredential>([
    ["bucket-a", credentialCreate("bucket-a", "old-a")],
    ["bucket-b", credentialCreate("bucket-b", "old-b")],
  ])
  const events: string[] = []
  const tokenNames: string[] = []
  let createCalls = 0
  let revokeCalls = 0
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({
      success: true,
      data: [bindingCreate("bucket-b"), bindingCreate("bucket-a"), bindingCreate("bucket-b")],
    }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => {
        events.push(`persist:${input.bucket}:${input.accessKeyId}`)
        const saved = { ...credentialCreate(input.bucket, input.accessKeyId), ...input }
        credentials.set(input.bucket, saved)
        return { success: true, data: saved }
      },
    },
    credentialProbe: async (bucket) => {
      const credential = credentials.get(bucket)
      events.push(`probe:${bucket}:${credential?.accessKeyId ?? "missing"}`)
      return credential?.accessKeyId.includes("new")
        ? { success: true, data: { reachable: true, status: 200 } }
        : { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } }
    },
    r2BucketCredentialCreate: async (input) => {
      createCalls += 1
      tokenNames.push(input.name ?? "")
      events.push(`create:${input.bucket}`)
      return { success: true, data: credentialInputCreate(input.bucket, `new-${input.bucket}`) }
    },
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      revokeCalls += 1
      events.push(`revoke:${revocationId}`)
      return { success: true, data: true }
    },
  })

  const first = await operation.r2BucketCredentialRepair(requestCredentials)
  expect(first).toEqual({
    success: true,
    data: {
      discoveredBuckets: ["bucket-a", "bucket-b"],
      repairedBuckets: ["bucket-a", "bucket-b"],
      skippedBuckets: [],
      verifiedBuckets: ["bucket-a", "bucket-b"],
      revokedBuckets: ["bucket-a", "bucket-b"],
    },
  })
  expect(createCalls).toBe(2)
  expect(revokeCalls).toBe(2)
  expect(tokenNames).toEqual(["assets-service-repair", "assets-service-repair"])
  expect(events.indexOf("persist:bucket-a:access-key-new-bucket-a")).toBeLessThan(
    events.indexOf("probe:bucket-a:access-key-new-bucket-a"),
  )
  expect(events.indexOf("probe:bucket-a:access-key-new-bucket-a")).toBeLessThan(
    events.indexOf("revoke:revocation-old-a"),
  )

  const second = await operation.r2BucketCredentialRepair(requestCredentials)
  expect(second).toMatchObject({ success: true, data: { skippedBuckets: ["bucket-a", "bucket-b"] } })
  expect(createCalls).toBe(2)
  expect(revokeCalls).toBe(2)
})

test("does not replace a credential when its probe cannot be completed", async () => {
  const current = credentialCreate("bucket", "old")
  let createCalls = 0
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: () => ({ success: true, data: current }),
      r2BucketCredentialCreate: () => ({ success: true, data: current }),
    },
    credentialProbe: async () => ({ success: false, op: "testProbe", errorMessage: "probe unavailable" }),
    r2BucketCredentialCreate: async () => {
      createCalls += 1
      return { success: true, data: credentialInputCreate("bucket", "new") }
    },
    r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({ success: false, diagnostics: { bucket: "bucket", phase: "probe" } })
  expect(createCalls).toBe(0)
})

test("restores and verifies the old persisted credential before revoking an unverified replacement", async () => {
  const oldCredential = credentialCreate("bucket", "old")
  let persisted = oldCredential
  const revoked: string[] = []
  let probeCount = 0
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: () => ({ success: true, data: persisted }),
      r2BucketCredentialCreate: (input) => {
        persisted = { ...oldCredential, ...input }
        return { success: true, data: persisted }
      },
    },
    credentialProbe: async () => {
      probeCount += 1
      return { success: true, data: { reachable: probeCount === 3, status: probeCount === 3 ? 200 : 403 } }
    },
    r2BucketCredentialCreate: async () => ({ success: true, data: credentialInputCreate("bucket", "new") }),
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      revoked.push(revocationId)
      return { success: true, data: true }
    },
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({ success: false, diagnostics: { bucket: "bucket", phase: "verify" } })
  expect(persisted).toEqual(oldCredential)
  expect(revoked).toEqual(["revocation-new"])
})

test("retries a pending obsolete-token revocation without creating another replacement", async () => {
  const credentials = new Map<string, R2BucketCredential>([["bucket", credentialCreate("bucket", "old")]])
  let createCalls = 0
  let revokeCalls = 0
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => {
        const saved = { ...credentialCreate(input.bucket, "new"), ...input }
        credentials.set(input.bucket, saved)
        return { success: true, data: saved }
      },
    },
    credentialProbe: async (bucket) =>
      credentials.get(bucket)?.accessKeyId.includes("new")
        ? { success: true, data: { reachable: true, status: 200 } }
        : { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } },
    r2BucketCredentialCreate: async (input) => {
      createCalls += 1
      return { success: true, data: credentialInputCreate(input.bucket, "new") }
    },
    r2BucketCredentialRevoke: async () => {
      revokeCalls += 1
      return revokeCalls === 1
        ? { success: false, op: "testRevoke", errorMessage: "temporary failure" }
        : { success: true, data: true }
    },
  })

  const first = await operation.r2BucketCredentialRepair(requestCredentials)
  const second = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(first).toMatchObject({ success: false, diagnostics: { phase: "revoke", bucket: "bucket" } })
  expect(second).toMatchObject({ success: true, data: { skippedBuckets: ["bucket"], verifiedBuckets: ["bucket"] } })
  expect(createCalls).toBe(1)
  expect(revokeCalls).toBe(2)
})

test("redacts request and credential material from repair failures and logs", async () => {
  const oldCredential = credentialCreate("bucket", "old")
  const replacement = credentialInputCreate("bucket", "new")
  const logs: unknown[] = []
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: () => ({ success: true, data: oldCredential }),
      r2BucketCredentialCreate: () => ({
        success: false,
        op: "test",
        errorMessage: `token=${requestCredentials.apiToken} old=${oldCredential.secretAccessKey} new=${replacement.secretAccessKey}`,
      }),
    },
    credentialProbe: async () => ({ success: true, data: { reachable: false, status: 403 } }),
    r2BucketCredentialCreate: async () => ({ success: true, data: replacement }),
    r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
    repairLogger: (entry) => logs.push(entry),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(JSON.stringify(result)).not.toContain(requestCredentials.apiToken)
  expect(JSON.stringify(result)).not.toContain(oldCredential.secretAccessKey)
  expect(JSON.stringify(result)).not.toContain(replacement.secretAccessKey)
  expect(JSON.stringify(logs)).not.toContain(requestCredentials.apiToken)
  expect(JSON.stringify(logs)).not.toContain(oldCredential.secretAccessKey)
  expect(JSON.stringify(logs)).not.toContain(replacement.secretAccessKey)
})
