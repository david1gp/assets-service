import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"

export const wranglerBucketDomainDelete = async (
  runner: WranglerCommandRunner,
  input: {
    bucket: string
    customDomain: string
    profile?: string
    accountId?: string
    apiToken?: string
  },
): Promise<Result<{ name: string; deleted: boolean }>> => {
  const op = "wranglerBucketDomainDelete"
  if (typeof input.bucket !== "string" || input.bucket.length === 0) return resultErrorCreate(op, "Bucket is required")
  if (typeof input.customDomain !== "string" || input.customDomain.length === 0)
    return resultErrorCreate(op, "Custom domain is required")
  const credentials = { accountId: input.accountId, apiToken: input.apiToken }
  const lookup = await commandInvoke(
    runner,
    ["r2", "bucket", "domain", "get", input.bucket, "--domain", input.customDomain],
    input.profile,
    credentials,
  )
  if (!lookup.success) return lookup
  if (lookup.data.exitCode !== 0) {
    if (resourceMissing(lookup.data)) return { success: true, data: { name: input.customDomain, deleted: false } }
    return resultErrorCreate(op, "Wrangler custom domain lookup failed")
  }

  const deleted = await commandInvoke(
    runner,
    ["r2", "bucket", "domain", "remove", input.bucket, "--domain", input.customDomain],
    input.profile,
    credentials,
  )
  if (!deleted.success) return deleted
  if (deleted.data.exitCode !== 0) {
    if (resourceMissing(deleted.data)) return { success: true, data: { name: input.customDomain, deleted: false } }
    return resultErrorCreate(op, "Wrangler custom domain deletion failed")
  }

  const remaining = await commandInvoke(
    runner,
    ["r2", "bucket", "domain", "get", input.bucket, "--domain", input.customDomain],
    input.profile,
    credentials,
  )
  if (!remaining.success) return remaining
  if (remaining.data.exitCode === 0)
    return resultErrorCreate(op, "Wrangler custom domain deletion could not be verified")
  if (!resourceMissing(remaining.data))
    return resultErrorCreate(op, "Wrangler custom domain deletion could not be verified")
  return { success: true, data: { name: input.customDomain, deleted: true } }
}

async function commandInvoke(
  runner: WranglerCommandRunner,
  args: readonly string[],
  profile: string | undefined,
  credentials: { accountId?: string; apiToken?: string },
): Promise<Result<{ exitCode: number; stdout: string; stderr: string }>> {
  try {
    const result = await runner({
      args: profile === undefined ? args : [...args, "--profile", profile],
      ...(credentials.accountId === undefined ? {} : { accountId: credentials.accountId }),
      ...(credentials.apiToken === undefined ? {} : { apiToken: credentials.apiToken }),
    })
    if (!result.success) return resultErrorCreate("wranglerBucketDomainDelete", "Wrangler command failed")
    return result
  } catch {
    return resultErrorCreate("wranglerBucketDomainDelete", "Wrangler command failed")
  }
}

function resourceMissing(output: { stdout: string; stderr: string }): boolean {
  return /(?:bucket|custom domain|domain|r2 bucket)[\s\S]{0,100}(?:not found|does not exist|no such)|code\s*[:=]\s*10006|"code"\s*:\s*10006|\b404\b/iu.test(
    `${output.stderr}\n${output.stdout}`,
  )
}
