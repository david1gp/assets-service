import { expect, test } from "bun:test"

import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRegisterResponse } from "../src/api-client/r2BucketCredentialRegisterResponseSchema.js"
import { projectCreateCredentialReconciliationRun } from "../src/asset-cli/projectCreateCredentialReconciliationRun.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import type { Result } from "../src/schemas/resultSchema.js"
import type { EnvironmentName } from "../src/schemas/environmentNameSchema.js"

const r2Credentials = { accessKeyId: "configured-access-key", secretAccessKey: "configured-secret-key" }

const credentialCreate = (bucket: string): R2BucketCredentialCreateInput => ({
  bucket,
  ...r2Credentials,
  revocationId: null,
})

const generatedCredentialCreate = (bucket: string): R2BucketCredentialCreateInput => ({
  bucket,
  accessKeyId: `generated-access-${bucket}`,
  secretAccessKey: `generated-secret-${bucket}`,
  revocationId: `generated-revocation-${bucket}`,
})

const statusCreate = (environment: EnvironmentName, bucket: string, registered: boolean) => ({
  projectId: "project-1",
  environment,
  bucket,
  registered,
})

const reconciliationRun = async (input: {
  buckets: readonly [string, string]
  registeredBuckets?: readonly string[]
  credentialsRead?: () => Result<typeof r2Credentials | null>
  cloudflareCredentialsRead?: () => Result<{ accountId: string; apiToken: string }>
  cloudflareCreateResult?: Result<R2BucketCredentialCreateInput>
  cloudflareRevokeResult?: Result<boolean>
  registerResult?: Result<R2BucketCredentialRegisterResponse>
}) => {
  const registeredBuckets = new Set(input.registeredBuckets ?? [])
  const events: string[] = []
  const statusCalls: EnvironmentName[] = []
  const registerCalls: Array<{ environment: EnvironmentName; input: R2BucketCredentialCreateInput }> = []
  const createCalls: Array<{ accountId: string; apiToken: string; bucket: string }> = []
  const revokeCalls: Array<{ accountId: string; apiToken: string; revocationId: string }> = []
  const environments = [
    { name: "development" as const, r2Bucket: input.buckets[0] },
    { name: "production" as const, r2Bucket: input.buckets[1] },
  ]

  const result = await projectCreateCredentialReconciliationRun({
    projectId: "project-1",
    environments,
    projectCreateR2CredentialsRead: () => {
      events.push("credentials:read")
      return input.credentialsRead?.() ?? { success: true, data: r2Credentials }
    },
    cloudflareCredentialsRead: () => {
      events.push("cloudflare:read")
      return (
        input.cloudflareCredentialsRead?.() ?? {
          success: true,
          data: { accountId: "cloudflare-account", apiToken: "cloudflare-api-token" },
        }
      )
    },
    cloudflareR2BucketCredentialCreate: async (credentialInput) => {
      events.push(`cloudflare:create:${credentialInput.bucket}`)
      createCalls.push({
        accountId: credentialInput.accountId,
        apiToken: credentialInput.apiToken,
        bucket: credentialInput.bucket,
      })
      return input.cloudflareCreateResult ?? { success: true, data: generatedCredentialCreate(credentialInput.bucket) }
    },
    cloudflareR2BucketCredentialRevoke: async (credentialInput) => {
      events.push(`cloudflare:revoke:${credentialInput.revocationId}`)
      revokeCalls.push(credentialInput)
      return input.cloudflareRevokeResult ?? { success: true, data: true }
    },
    client: {
      r2BucketCredentialStatusRead: async (_projectId, environment) => {
        events.push(`status:${environment}`)
        statusCalls.push(environment)
        const selected = environments.find((candidate) => candidate.name === environment)
        if (selected === undefined) return resultErrorCreate("test", "Unknown environment")
        return {
          success: true,
          data: statusCreate(environment, selected.r2Bucket, registeredBuckets.has(selected.r2Bucket)),
        }
      },
      r2BucketCredentialRegister: async (_projectId, environment, credential) => {
        events.push(`register:${credential.bucket}`)
        registerCalls.push({ environment, input: credential })
        if (input.registerResult !== undefined) return input.registerResult
        registeredBuckets.add(credential.bucket)
        return {
          success: true,
          data: { ...statusCreate(environment, credential.bucket, true), registered: true as const },
        }
      },
    },
  })

  return { result, events, statusCalls, registerCalls, createCalls, revokeCalls }
}

test("registers one imported R2 credential per distinct missing bucket", async () => {
  const outcome = await reconciliationRun({ buckets: ["bucket-development", "bucket-production"] })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.registerCalls.map((call) => call.environment)).toEqual(["development", "production"])
  expect(outcome.registerCalls.map((call) => call.input)).toEqual([
    credentialCreate("bucket-development"),
    credentialCreate("bucket-production"),
  ])
  expect(outcome.statusCalls).toEqual(["development", "production", "development", "production"])
  expect(outcome.events).toEqual([
    "status:development",
    "status:production",
    "credentials:read",
    "register:bucket-development",
    "register:bucket-production",
    "status:development",
    "status:production",
  ])
})

test("prefers complete imported credentials over Cloudflare credential creation", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    cloudflareCredentialsRead: () => resultErrorCreate("test", "Cloudflare credentials were incomplete"),
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.createCalls).toHaveLength(0)
  expect(outcome.revokeCalls).toHaveLength(0)
  expect(outcome.registerCalls.every((call) => call.input.revocationId === null)).toBe(true)
  expect(outcome.events).not.toContain("cloudflare:read")
})

test("falls back to one generated credential per distinct missing bucket", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => ({ success: true, data: null }),
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.createCalls).toEqual([
    { accountId: "cloudflare-account", apiToken: "cloudflare-api-token", bucket: "bucket-development" },
    { accountId: "cloudflare-account", apiToken: "cloudflare-api-token", bucket: "bucket-production" },
  ])
  expect(outcome.registerCalls.map((call) => call.input.revocationId)).toEqual([
    "generated-revocation-bucket-development",
    "generated-revocation-bucket-production",
  ])
})

test("deduplicates a shared missing bucket and registers it through one environment", async () => {
  const outcome = await reconciliationRun({ buckets: ["shared-bucket", "shared-bucket"] })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.registerCalls).toEqual([{ environment: "development", input: credentialCreate("shared-bucket") }])
  expect(outcome.statusCalls).toEqual(["development", "production", "development", "production"])
})

test("deduplicates a shared missing bucket before generating a credential", async () => {
  const outcome = await reconciliationRun({
    buckets: ["shared-bucket", "shared-bucket"],
    credentialsRead: () => ({ success: true, data: null }),
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.createCalls).toEqual([
    { accountId: "cloudflare-account", apiToken: "cloudflare-api-token", bucket: "shared-bucket" },
  ])
  expect(outcome.registerCalls).toHaveLength(1)
})

test("skips imported credential registration when every bucket is already registered", async () => {
  let credentialsReadCount = 0
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registeredBuckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => {
      credentialsReadCount += 1
      return resultErrorCreate("test", "R2 credentials were not configured")
    },
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(credentialsReadCount).toBe(0)
  expect(outcome.registerCalls).toHaveLength(0)
  expect(outcome.events).toEqual(["status:development", "status:production", "status:development", "status:production"])
})

test("registers only the bucket missing from the initial status results", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registeredBuckets: ["bucket-development"],
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.registerCalls).toEqual([{ environment: "production", input: credentialCreate("bucket-production") }])
})

test("rejects missing imported credentials before registration", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => resultErrorCreate("assetsCliR2CredentialsRead", "R2 credentials were incomplete"),
  })

  expect(outcome.result).toEqual({
    success: false,
    op: "assetsCliR2CredentialsRead",
    errorMessage: "R2 credentials were incomplete",
  })
  expect(outcome.registerCalls).toHaveLength(0)
  expect(outcome.statusCalls).toEqual(["development", "production"])
})

test("rejects incomplete Cloudflare credentials before generation", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => ({ success: true, data: null }),
    cloudflareCredentialsRead: () =>
      resultErrorCreate("assetsCliCloudflareRequestCredentialsRead", "Cloudflare credentials were incomplete"),
  })

  expect(outcome.result).toEqual({
    success: false,
    op: "assetsCliCloudflareRequestCredentialsRead",
    errorMessage: "Cloudflare credentials were incomplete",
  })
  expect(outcome.createCalls).toHaveLength(0)
  expect(outcome.registerCalls).toHaveLength(0)
  expect(outcome.revokeCalls).toHaveLength(0)
})

test("revokes a generated credential when registration fails and redacts credential material", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => ({ success: true, data: null }),
    registerResult: resultErrorCreate(
      "assetsApiClientR2BucketCredentialRegister",
      "registration failed with cloudflare-api-token, generated-access-bucket-development, generated-secret-bucket-development, and generated-revocation-bucket-development",
    ),
  })

  expect(outcome.result).toEqual({
    success: false,
    op: "assetsCliProjectCreateCredentialReconciliation",
    errorMessage: "Could not register the scoped R2 credential for bucket-development",
  })
  expect(outcome.revokeCalls).toEqual([
    {
      accountId: "cloudflare-account",
      apiToken: "cloudflare-api-token",
      revocationId: "generated-revocation-bucket-development",
    },
  ])
  const serialized = JSON.stringify(outcome.result)
  expect(serialized).not.toContain("cloudflare-api-token")
  expect(serialized).not.toContain("generated-access-bucket-development")
  expect(serialized).not.toContain("generated-secret-bucket-development")
  expect(serialized).not.toContain("generated-revocation-bucket-development")
})

test("redacts imported R2 credentials from registration errors", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registerResult: resultErrorCreate(
      "assetsApiClientR2BucketCredentialRegister",
      "registration failed with configured-access-key and configured-secret-key",
    ),
  })

  expect(outcome.result).toMatchObject({ success: false })
  const message = outcome.result.success ? "" : outcome.result.errorMessage
  expect(message).toContain("Could not register the scoped R2 credential for bucket-development")
  expect(message).not.toContain("configured-access-key")
  expect(message).not.toContain("configured-secret-key")
})
