import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { r2BucketCredentialTable } from "../src/infrastructure/db/schema/r2BucketCredentialTable.js"
import { r2BucketCredentialBackfillCreate } from "../src/r2/r2BucketCredentialBackfillCreate.js"
import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import { r2BucketCredentialRepositoryCreate } from "../src/r2/r2BucketCredentialRepositoryCreate.js"
import type { R2BucketCredential } from "../src/r2/r2BucketCredentialSchema.js"
import type { StorageBinding } from "../src/storage/storageBindingSchema.js"

const credentials = { accountId: "account-1", apiToken: "request-token" }
const bindingCreate = (bucket: string): StorageBinding => ({
  projectId: "project-1",
  environment: "production",
  bucket,
  prefix: "project-1",
  publicBaseUrl: "https://assets.example.test",
})
const credentialCreate = (bucket: string): R2BucketCredentialCreateInput => ({
  bucket,
  accessKeyId: `access-key-${bucket}`,
  secretAccessKey: `secret-key-${bucket}`,
  revocationId: `revocation-${bucket}`,
})
const credentialRead = (input: R2BucketCredentialCreateInput): R2BucketCredential => ({
  ...input,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
})

test("dry-run deduplicates shared buckets and skips existing credentials without side effects", async () => {
  let cloudflareCalls = 0
  let persistenceCalls = 0
  const existing = credentialRead(credentialCreate("existing"))
  const backfill = r2BucketCredentialBackfillCreate({
    liveStorageBindingsRead: () => ({
      success: true,
      data: [bindingCreate("shared"), bindingCreate("shared"), bindingCreate("existing")],
    }),
    r2BucketCredentialRepository: {
      r2BucketCredentialsRead: () => ({ success: true, data: [existing] }),
      r2BucketCredentialCreate: () => {
        persistenceCalls += 1
        return { success: true, data: existing }
      },
    },
    r2BucketCredentialCreate: async () => {
      cloudflareCalls += 1
      return { success: true, data: credentialCreate("shared") }
    },
  })

  const result = await backfill.r2BucketCredentialBackfill(credentials, true)

  expect(result).toEqual({
    success: true,
    data: {
      dryRun: true,
      discoveredBuckets: ["existing", "shared"],
      plannedBuckets: ["shared"],
      createdBuckets: [],
      skippedBuckets: ["existing"],
    },
  })
  expect(cloudflareCalls).toBe(0)
  expect(persistenceCalls).toBe(0)
})

test("skips an imported credential without a revocation ID instead of replacing it", async () => {
  const imported = credentialRead({ ...credentialCreate("imported"), revocationId: null })
  let createCalls = 0
  const backfill = r2BucketCredentialBackfillCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("imported")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialsRead: () => ({ success: true, data: [imported] }),
      r2BucketCredentialCreate: () => {
        createCalls += 1
        return { success: true, data: imported }
      },
    },
    r2BucketCredentialCreate: async () => {
      createCalls += 1
      return { success: true, data: credentialCreate("imported") }
    },
  })

  const result = await backfill.r2BucketCredentialBackfill(credentials)

  expect(result).toEqual({
    success: true,
    data: {
      dryRun: false,
      discoveredBuckets: ["imported"],
      plannedBuckets: [],
      createdBuckets: [],
      skippedBuckets: ["imported"],
    },
  })
  expect(createCalls).toBe(0)
})

test("creates one encrypted credential for each distinct live bucket", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const repository = r2BucketCredentialRepositoryCreate(opened.data.db, { encryptionKey: "master-key" })
    const createdBuckets: string[] = []
    const backfill = r2BucketCredentialBackfillCreate({
      liveStorageBindingsRead: () => ({
        success: true,
        data: [bindingCreate("shared"), bindingCreate("shared"), bindingCreate("second")],
      }),
      r2BucketCredentialRepository: repository,
      r2BucketCredentialCreate: async (input) => {
        createdBuckets.push(input.bucket)
        return { success: true, data: credentialCreate(input.bucket) }
      },
    })

    const result = await backfill.r2BucketCredentialBackfill(credentials)

    expect(result).toMatchObject({
      success: true,
      data: { discoveredBuckets: ["second", "shared"], createdBuckets: ["second", "shared"], skippedBuckets: [] },
    })
    expect(createdBuckets).toEqual(["second", "shared"])
    expect(repository.r2BucketCredentialsRead()).toMatchObject({
      success: true,
      data: [
        { bucket: "second", secretAccessKey: "secret-key-second" },
        { bucket: "shared", secretAccessKey: "secret-key-shared" },
      ],
    })
    const ciphertext = opened.data.db
      .select()
      .from(r2BucketCredentialTable)
      .where(eq(r2BucketCredentialTable.bucket, "shared"))
      .get()
    expect(ciphertext?.secretAccessKeyCiphertext).not.toContain("secret-key-shared")
  } finally {
    databaseClose(opened.data)
  }
})

test("retrying a partial persistence failure does not recreate the usable credential", async () => {
  const persisted = new Map<string, R2BucketCredential>()
  let persistenceAttempts = 0
  let cloudflareCalls = 0
  let failSecondPersistence = true
  const backfill = r2BucketCredentialBackfillCreate({
    liveStorageBindingsRead: () => ({
      success: true,
      data: [bindingCreate("first"), bindingCreate("second")],
    }),
    r2BucketCredentialRepository: {
      r2BucketCredentialsRead: () => ({ success: true, data: [...persisted.values()] }),
      r2BucketCredentialCreate: (input) => {
        persistenceAttempts += 1
        if (input.bucket === "second" && failSecondPersistence)
          return { success: false, op: "test", errorMessage: "temporary persistence failure", retryable: true }
        const saved = credentialRead(input)
        persisted.set(input.bucket, saved)
        return { success: true, data: saved }
      },
    },
    r2BucketCredentialCreate: async (input) => {
      cloudflareCalls += 1
      return { success: true, data: credentialCreate(input.bucket) }
    },
  })

  const first = await backfill.r2BucketCredentialBackfill(credentials)
  expect(first).toMatchObject({ success: false, retryable: true })
  failSecondPersistence = false
  const second = await backfill.r2BucketCredentialBackfill(credentials)
  expect(second).toMatchObject({ success: true })
  expect(cloudflareCalls).toBe(2)
  expect(persistenceAttempts).toBe(3)
  expect([...persisted.keys()]).toEqual(["first", "second"])
})

test("redacts request credentials from backfill failures and logs", async () => {
  const logs: unknown[] = []
  const backfill = r2BucketCredentialBackfillCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialsRead: () => ({ success: true, data: [] }),
      r2BucketCredentialCreate: () => ({ success: true, data: credentialRead(credentialCreate("bucket")) }),
    },
    r2BucketCredentialCreate: async () => ({
      success: false,
      op: "test",
      errorMessage: "Authorization: Bearer request-token",
    }),
    backfillLogger: (entry) => logs.push(entry),
  })

  const result = await backfill.r2BucketCredentialBackfill(credentials)
  expect(JSON.stringify(result)).not.toContain("request-token")
  expect(JSON.stringify(logs)).not.toContain("request-token")
})

test("redacts generated credential fields from persistence failures and logs", async () => {
  const generated = credentialCreate("bucket")
  const logs: unknown[] = []
  const backfill = r2BucketCredentialBackfillCreate({
    liveStorageBindingsRead: () => ({ success: true, data: [bindingCreate("bucket")] }),
    r2BucketCredentialRepository: {
      r2BucketCredentialsRead: () => ({ success: true, data: [] }),
      r2BucketCredentialCreate: () => ({
        success: false,
        op: "test",
        errorMessage: `accessKeyId=${generated.accessKeyId} secretAccessKey=${generated.secretAccessKey} revocationId=${generated.revocationId}`,
      }),
    },
    r2BucketCredentialCreate: async () => ({ success: true, data: generated }),
    backfillLogger: (entry) => logs.push(entry),
  })

  const result = await backfill.r2BucketCredentialBackfill(credentials)

  expect(result).toMatchObject({ success: false, retryable: true })
  expect(JSON.stringify(result)).not.toContain(generated.accessKeyId)
  expect(JSON.stringify(result)).not.toContain(generated.secretAccessKey)
  expect(JSON.stringify(result)).not.toContain(generated.revocationId)
  expect(JSON.stringify(logs)).not.toContain(generated.accessKeyId)
  expect(JSON.stringify(logs)).not.toContain(generated.secretAccessKey)
  expect(JSON.stringify(logs)).not.toContain(generated.revocationId)
})
