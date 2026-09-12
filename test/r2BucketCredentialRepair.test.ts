import { expect, test } from "bun:test"
import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import { r2BucketCredentialRepairCreate } from "../src/r2/r2BucketCredentialRepairCreate.js"
import type { R2BucketCredentialRepairPendingRepository } from "../src/r2/r2BucketCredentialRepairPendingRepository.js"
import type { R2BucketCredentialRepairPending } from "../src/r2/r2BucketCredentialRepairPendingSchema.js"
import type { R2BucketCredentialRepairRecoveryRepository } from "../src/r2/r2BucketCredentialRepairRecoveryRepository.js"
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

const pendingRepositoryCreate = (): R2BucketCredentialRepairPendingRepository => {
  const pending = new Map<string, R2BucketCredentialRepairPending>()
  const claims = new Map<string, string>()
  return {
    r2BucketCredentialRepairPendingCreate: (input) => {
      const saved: R2BucketCredentialRepairPending = {
        bucket: input.bucket,
        previousCredential: input.previousCredential,
        replacementRevocationId: input.replacementRevocationId,
      }
      pending.set(input.bucket, saved)
      return { success: true, data: saved }
    },
    r2BucketCredentialRepairPendingRead: (bucket) => ({ success: true, data: pending.get(bucket) ?? null }),
    r2BucketCredentialRepairPendingsRead: () => ({ success: true, data: [...pending.values()] }),
    r2BucketCredentialRepairPendingDelete: (bucket) => ({ success: true, data: pending.delete(bucket) }),
    r2BucketCredentialRepairClaim: ({ bucket, ownerId }) => {
      const existing = claims.get(bucket)
      if (existing !== undefined && existing !== ownerId) return { success: true, data: false }
      claims.set(bucket, ownerId)
      return { success: true, data: true }
    },
    r2BucketCredentialRepairRelease: ({ bucket, ownerId }) => {
      if (claims.get(bucket) !== ownerId) return { success: true, data: false }
      claims.delete(bucket)
      return { success: true, data: true }
    },
  }
}

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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
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

test("repairs credentials when the persisted probe reports an authorization failure", async () => {
  const credentials = new Map<string, R2BucketCredential>([["bucket", credentialCreate("bucket", "old")]])
  let probeCount = 0
  let createCalls = 0
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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
    credentialProbe: async () => {
      probeCount += 1
      if (probeCount === 1)
        return {
          success: false,
          op: "probe",
          errorMessage: "R2 request failed with status 403",
          diagnostics: { status: 403 },
        }
      return { success: true, data: { reachable: true, status: 200 } }
    },
    r2BucketCredentialCreate: async (input) => {
      createCalls += 1
      return { success: true, data: credentialInputCreate(input.bucket, "new") }
    },
    r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({ success: true, data: { repairedBuckets: ["bucket"], revokedBuckets: ["bucket"] } })
  expect(createCalls).toBe(1)
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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
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

test("retries a pending obsolete-token revocation after operation recreation", async () => {
  const credentials = new Map<string, R2BucketCredential>([["bucket", credentialCreate("bucket", "old")]])
  const pendingRepository = pendingRepositoryCreate()
  let createCalls = 0
  let revokeCalls = 0
  const operationCreate = () =>
    r2BucketCredentialRepairCreate({
      liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
      r2BucketCredentialRepository: {
        r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
        r2BucketCredentialCreate: (input) => {
          const saved = { ...credentialCreate(input.bucket, "new"), ...input }
          credentials.set(input.bucket, saved)
          return { success: true, data: saved }
        },
      },
      r2BucketCredentialRepairPendingRepository: pendingRepository,
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

  const first = await operationCreate().r2BucketCredentialRepair(requestCredentials)
  const second = await operationCreate().r2BucketCredentialRepair(requestCredentials)

  expect(first).toMatchObject({ success: false, diagnostics: { phase: "revoke", bucket: "bucket" } })
  expect(second).toMatchObject({
    success: true,
    data: { skippedBuckets: ["bucket"], verifiedBuckets: ["bucket"], revokedBuckets: ["bucket"] },
  })
  expect(createCalls).toBe(1)
  expect(revokeCalls).toBe(2)
})

test("drains a pending revocation for a bucket no longer present in live bindings", async () => {
  const previous = credentialCreate("retired-bucket", "old")
  const current = credentialCreate("retired-bucket", "new")
  const credentials = new Map<string, R2BucketCredential>([[current.bucket, current]])
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: current.bucket,
    previousCredential: previous,
    replacementRevocationId: "revocation-new",
  })
  const revoked: string[] = []
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => {
        const saved = { ...current, ...input }
        credentials.set(input.bucket, saved)
        return { success: true, data: saved }
      },
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    credentialProbe: async () => ({ success: true, data: { reachable: true, status: 200 } }),
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      revoked.push(revocationId)
      return { success: true, data: true }
    },
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toEqual({
    success: true,
    data: { discoveredBuckets: [], repairedBuckets: [], skippedBuckets: [], verifiedBuckets: [], revokedBuckets: [] },
  })
  expect(revoked).toEqual(["revocation-old"])
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toEqual({ success: true, data: [] })
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
    r2BucketCredentialRepairPendingRepository: pendingRepositoryCreate(),
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

test("serializes repairs across independently created operations before replacement creation", async () => {
  const credentials = new Map<string, R2BucketCredential>([["bucket", credentialCreate("bucket", "old")]])
  const pendingRepository = pendingRepositoryCreate()
  let createCalls = 0
  let probeStarted: () => void = () => undefined
  let releaseProbe: () => void = () => undefined
  const probeReady = new Promise<void>((resolve) => {
    probeStarted = resolve
  })
  const probeRelease = new Promise<void>((resolve) => {
    releaseProbe = resolve
  })
  const operationCreate = () =>
    r2BucketCredentialRepairCreate({
      liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
      r2BucketCredentialRepository: {
        r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
        r2BucketCredentialCreate: (input) => {
          const saved = { ...credentialCreate(input.bucket, "new"), ...input }
          credentials.set(input.bucket, saved)
          return { success: true, data: saved }
        },
      },
      r2BucketCredentialRepairPendingRepository: pendingRepository,
      credentialProbe: async (bucket) => {
        if (credentials.get(bucket)?.accessKeyId.includes("old")) {
          probeStarted()
          await probeRelease
          return { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } }
        }
        return { success: true, data: { reachable: true, status: 200 } }
      },
      r2BucketCredentialCreate: async (input) => {
        createCalls += 1
        return { success: true, data: credentialInputCreate(input.bucket, "new") }
      },
      r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
    })

  const firstPromise = operationCreate().r2BucketCredentialRepair(requestCredentials)
  await probeReady
  const second = await operationCreate().r2BucketCredentialRepair(requestCredentials)
  expect(second).toMatchObject({ success: false, diagnostics: { phase: "persist", bucket: "bucket" } })
  expect(createCalls).toBe(0)

  releaseProbe()
  const first = await firstPromise
  expect(first).toMatchObject({ success: true, data: { repairedBuckets: ["bucket"] } })
  expect(createCalls).toBe(1)
})

test("revokes both orphaned pending and previous credentials when another replacement is current", async () => {
  const previous = credentialCreate("bucket", "old")
  const current = credentialCreate("bucket", "current")
  const credentials = new Map<string, R2BucketCredential>([["bucket", current]])
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: "bucket",
    previousCredential: previous,
    replacementRevocationId: "revocation-orphan",
  })
  const revoked: string[] = []
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: () => ({ success: true, data: credentials.get("bucket") ?? null }),
      r2BucketCredentialCreate: (input) => ({ success: true, data: { ...current, ...input } }),
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    credentialProbe: async () => ({ success: true, data: { reachable: true, status: 200 } }),
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      revoked.push(revocationId)
      return { success: true, data: true }
    },
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({ success: true, data: { skippedBuckets: ["bucket"], revokedBuckets: ["bucket"] } })
  expect(revoked).toEqual(["revocation-old", "revocation-orphan"])
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toEqual({ success: true, data: [] })
})

test("retains pending repair metadata when the persisted credential is missing", async () => {
  const previous = credentialCreate("bucket", "old")
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: "bucket",
    previousCredential: previous,
    replacementRevocationId: "revocation-replacement",
  })
  const revoked: string[] = []
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: () => ({ success: true, data: null }),
      r2BucketCredentialCreate: () => ({ success: true, data: previous }),
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    credentialProbe: async () => ({ success: true, data: { reachable: true, status: 200 } }),
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      revoked.push(revocationId)
      return { success: true, data: true }
    },
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({ success: false, diagnostics: { phase: "persist", bucket: "bucket" } })
  expect(revoked).toEqual(["revocation-replacement"])
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toMatchObject({
    success: true,
    data: [{ bucket: "bucket", replacementRevocationId: "revocation-replacement" }],
  })
})

test("reruns safely from a revoked replacement and atomically cleans the pending recovery state", async () => {
  const previous = credentialCreate("bucket", "old")
  const replacement = credentialCreate("bucket", "replacement")
  const credentials = new Map<string, R2BucketCredential>([["bucket", replacement]])
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: "bucket",
    previousCredential: previous,
    replacementRevocationId: replacement.revocationId ?? "",
  })
  const logs: unknown[] = []
  let createCalls = 0
  let revokeCalls = 0
  const recoveryRepository: R2BucketCredentialRepairRecoveryRepository = {
    r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending: ({
      bucket: recoveryBucket,
      previousCredential,
      expectedCurrentCredential,
    }) => {
      expect(expectedCurrentCredential).toEqual(replacement)
      const saved = { ...previousCredential }
      credentials.set(recoveryBucket, saved)
      const deleted = pendingRepository.r2BucketCredentialRepairPendingDelete(recoveryBucket)
      if (!deleted.success) return deleted
      return { success: true, data: saved }
    },
  }
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => {
        const saved = { ...previous, ...input }
        credentials.set(input.bucket, saved)
        return { success: true, data: saved }
      },
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    r2BucketCredentialRepairRecoveryRepository: recoveryRepository,
    credentialProbe: async (bucket, candidate) => {
      const accessKeyId = candidate?.accessKeyId ?? credentials.get(bucket)?.accessKeyId
      return accessKeyId === previous.accessKeyId
        ? { success: true, data: { reachable: true, status: 200 } }
        : { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } }
    },
    r2BucketCredentialCreate: async () => {
      createCalls += 1
      return { success: false, op: "testCreate", errorMessage: "must not create another replacement" }
    },
    r2BucketCredentialRevoke: async () => {
      revokeCalls += 1
      return { success: false, op: "testRevoke", errorMessage: "already revoked", diagnostics: { status: 404 } }
    },
    repairLogger: (entry) => logs.push(entry),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toEqual({
    success: true,
    data: {
      discoveredBuckets: ["bucket"],
      repairedBuckets: [],
      skippedBuckets: ["bucket"],
      verifiedBuckets: ["bucket"],
      revokedBuckets: ["bucket"],
    },
  })
  expect(credentials.get("bucket")).toEqual({ ...previous, updatedAt: previous.updatedAt })
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toEqual({ success: true, data: [] })
  expect(createCalls).toBe(0)
  expect(revokeCalls).toBe(1)
  expect(JSON.stringify(logs)).toContain("previous-credential-restored")
  expect(JSON.stringify(logs)).not.toContain(previous.secretAccessKey)
  expect(JSON.stringify(logs)).not.toContain(replacement.secretAccessKey)
})

test("retains pending recovery state when the previous credential cannot be verified", async () => {
  const previous = credentialCreate("bucket", "old")
  const replacement = credentialCreate("bucket", "replacement")
  const credentials = new Map<string, R2BucketCredential>([["bucket", replacement]])
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: "bucket",
    previousCredential: previous,
    replacementRevocationId: replacement.revocationId ?? "",
  })
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => ({ success: true, data: { ...replacement, ...input } }),
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    credentialProbe: async (_bucket, candidate) =>
      candidate === undefined || candidate.accessKeyId === replacement.accessKeyId
        ? { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } }
        : { success: true, data: { reachable: false, status: 403 } },
    r2BucketCredentialCreate: async () => ({ success: false, op: "testCreate", errorMessage: "must not create" }),
    r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({
    success: false,
    diagnostics: {
      bucket: "bucket",
      phase: "rollback",
      recovery: "previous-credential-restore-failed",
    },
  })
  expect(credentials.get("bucket")).toEqual(replacement)
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toMatchObject({
    success: true,
    data: [{ bucket: "bucket", replacementRevocationId: replacement.revocationId }],
  })
})

test("retains pending recovery state when the local restore transaction fails", async () => {
  const previous = credentialCreate("bucket", "old")
  const replacement = credentialCreate("bucket", "replacement")
  const credentials = new Map<string, R2BucketCredential>([["bucket", replacement]])
  const pendingRepository = pendingRepositoryCreate()
  pendingRepository.r2BucketCredentialRepairPendingCreate({
    bucket: "bucket",
    previousCredential: previous,
    replacementRevocationId: replacement.revocationId ?? "",
  })
  const recoveryRepository: R2BucketCredentialRepairRecoveryRepository = {
    r2BucketCredentialRepairRecoveryRestorePreviousAndDeletePending: () => ({
      success: false,
      op: "testRecovery",
      errorMessage: "database is busy",
    }),
  }
  const operation = r2BucketCredentialRepairCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({ success: true, data: credentials.get(bucket) ?? null }),
      r2BucketCredentialCreate: (input) => ({ success: true, data: { ...replacement, ...input } }),
    },
    r2BucketCredentialRepairPendingRepository: pendingRepository,
    r2BucketCredentialRepairRecoveryRepository: recoveryRepository,
    credentialProbe: async (_bucket, candidate) =>
      candidate === undefined
        ? { success: false, op: "testProbe", errorMessage: "R2 request failed", diagnostics: { status: 403 } }
        : { success: true, data: { reachable: true, status: 200 } },
    r2BucketCredentialCreate: async () => ({ success: false, op: "testCreate", errorMessage: "must not create" }),
    r2BucketCredentialRevoke: async () => ({ success: true, data: true }),
  })

  const result = await operation.r2BucketCredentialRepair(requestCredentials)

  expect(result).toMatchObject({
    success: false,
    diagnostics: {
      bucket: "bucket",
      phase: "persist",
      recovery: "previous-credential-restore-transaction-failed",
    },
  })
  expect(credentials.get("bucket")).toEqual(replacement)
  expect(pendingRepository.r2BucketCredentialRepairPendingsRead()).toMatchObject({
    success: true,
    data: [{ bucket: "bucket", replacementRevocationId: replacement.revocationId }],
  })
})
