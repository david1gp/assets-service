import { expect, test } from "bun:test"

import type { R2BucketCredentialCreateInput } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRegisterResponse } from "../src/api-client/r2BucketCredentialRegisterResponseSchema.js"
import { projectCreateCredentialReconciliationRun } from "../src/asset-cli/projectCreateCredentialReconciliationRun.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import type { Result } from "../src/schemas/resultSchema.js"
import type { EnvironmentName } from "../src/schemas/environmentNameSchema.js"

const cloudflareCredentials = { accountId: "account-id", apiToken: "broad-cloudflare-token" }

const credentialCreate = (bucket: string): R2BucketCredentialCreateInput => ({
  bucket,
  accessKeyId: `${bucket}-access-secret`,
  secretAccessKey: `${bucket}-secret-access-secret`,
  revocationId: `${bucket}-revocation-secret`,
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
  credentialsRead?: () => Result<typeof cloudflareCredentials>
  registerResult?: Result<R2BucketCredentialRegisterResponse>
  revokeResult?: Result<boolean>
}) => {
  const registeredBuckets = new Set(input.registeredBuckets ?? [])
  const statusCalls: EnvironmentName[] = []
  const registerCalls: Array<{ environment: EnvironmentName; input: R2BucketCredentialCreateInput }> = []
  const createCalls: string[] = []
  const revokeCalls: string[] = []
  const environments = [
    { name: "development" as const, r2Bucket: input.buckets[0] },
    { name: "production" as const, r2Bucket: input.buckets[1] },
  ]

  const result = await projectCreateCredentialReconciliationRun({
    projectId: "project-1",
    environments,
    cloudflareCredentialsRead: input.credentialsRead ?? (() => ({ success: true, data: cloudflareCredentials })),
    client: {
      r2BucketCredentialStatusRead: async (_projectId, environment) => {
        statusCalls.push(environment)
        const selected = environments.find((candidate) => candidate.name === environment)
        if (selected === undefined) return resultErrorCreate("test", "Unknown environment")
        return {
          success: true,
          data: statusCreate(environment, selected.r2Bucket, registeredBuckets.has(selected.r2Bucket)),
        }
      },
      r2BucketCredentialRegister: async (_projectId, environment, credential) => {
        registerCalls.push({ environment, input: credential })
        if (input.registerResult !== undefined) return input.registerResult
        registeredBuckets.add(credential.bucket)
        return {
          success: true,
          data: { ...statusCreate(environment, credential.bucket, true), registered: true as const },
        }
      },
    },
    cloudflareCredentialCreate: async ({ bucket }) => {
      createCalls.push(bucket)
      return { success: true, data: credentialCreate(bucket) }
    },
    cloudflareCredentialRevoke: async ({ revocationId }) => {
      revokeCalls.push(revocationId)
      return input.revokeResult ?? { success: true, data: true }
    },
  })

  return { result, statusCalls, registerCalls, createCalls, revokeCalls }
}

test("reconciles two missing buckets with one scoped credential per bucket", async () => {
  const outcome = await reconciliationRun({ buckets: ["bucket-development", "bucket-production"] })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.createCalls).toEqual(["bucket-development", "bucket-production"])
  expect(outcome.registerCalls.map((call) => call.environment)).toEqual(["development", "production"])
  expect(outcome.statusCalls).toEqual(["development", "production", "development", "production"])
  expect(outcome.registerCalls.map((call) => call.input.secretAccessKey)).toEqual([
    "bucket-development-secret-access-secret",
    "bucket-production-secret-access-secret",
  ])
})

test("deduplicates a shared missing bucket and registers it through one environment", async () => {
  const outcome = await reconciliationRun({ buckets: ["shared-bucket", "shared-bucket"] })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(outcome.createCalls).toEqual(["shared-bucket"])
  expect(outcome.registerCalls).toEqual([
    {
      environment: "development",
      input: credentialCreate("shared-bucket"),
    },
  ])
  expect(outcome.statusCalls).toEqual(["development", "production", "development", "production"])
})

test("does not require Cloudflare credentials or register an already registered bucket", async () => {
  let credentialsReadCount = 0
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registeredBuckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => {
      credentialsReadCount += 1
      return resultErrorCreate("test", "Cloudflare credentials were not configured")
    },
  })

  expect(outcome.result).toEqual({ success: true, data: undefined })
  expect(credentialsReadCount).toBe(0)
  expect(outcome.createCalls).toHaveLength(0)
  expect(outcome.registerCalls).toHaveLength(0)
  expect(outcome.statusCalls).toEqual(["development", "production", "development", "production"])
})

test("reports missing Cloudflare credentials only after finding a missing bucket", async () => {
  let credentialsReadCount = 0
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    credentialsRead: () => {
      credentialsReadCount += 1
      return resultErrorCreate(
        "assetsCliCloudflareRequestCredentialsRead",
        "R2 credential registration requires CLOUDFLARE_API_TOKEN",
      )
    },
  })

  expect(outcome.result).toMatchObject({
    success: false,
    errorMessage: "R2 credential registration requires CLOUDFLARE_API_TOKEN",
  })
  expect(credentialsReadCount).toBe(1)
  expect(outcome.createCalls).toHaveLength(0)
  expect(outcome.registerCalls).toHaveLength(0)
  expect(outcome.statusCalls).toEqual(["development", "production"])
})

test("revokes only the newly created credential when registration fails", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registerResult: resultErrorCreate(
      "assetsApiClientR2BucketCredentialRegister",
      "registration failed with broad-cloudflare-token and bucket-development-secret-access-secret",
    ),
  })

  expect(outcome.result).toMatchObject({ success: false })
  expect(outcome.createCalls).toEqual(["bucket-development"])
  expect(outcome.revokeCalls).toEqual(["bucket-development-revocation-secret"])
  expect(outcome.result.success ? "" : outcome.result.errorMessage).not.toContain("broad-cloudflare-token")
  expect(outcome.result.success ? "" : outcome.result.errorMessage).not.toContain(
    "bucket-development-secret-access-secret",
  )
  expect(outcome.result.success ? "" : outcome.result.errorMessage).not.toContain(
    "bucket-development-revocation-secret",
  )
})

test("reports a redacted combined cleanup error when revocation fails", async () => {
  const outcome = await reconciliationRun({
    buckets: ["bucket-development", "bucket-production"],
    registerResult: resultErrorCreate(
      "assetsApiClientR2BucketCredentialRegister",
      "registration failed with broad-cloudflare-token and bucket-development-access-secret",
    ),
    revokeResult: resultErrorCreate(
      "cloudflareR2BucketCredentialRevoke",
      "cleanup failed for bucket-development-revocation-secret using broad-cloudflare-token",
    ),
  })

  expect(outcome.result).toMatchObject({ success: false })
  expect(outcome.result.success ? "" : outcome.result.errorMessage).toContain("cleanup failed:")
  expect(outcome.result.success ? "" : outcome.result.errorMessage).not.toContain("broad-cloudflare-token")
  expect(outcome.result.success ? "" : outcome.result.errorMessage).not.toContain(
    "bucket-development-revocation-secret",
  )
})
