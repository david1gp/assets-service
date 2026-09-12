import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"

type WranglerProvisioningInput = {
  bucket: string
  createBucket: boolean
  customDomain?: string
  zoneId?: string
  profile?: string
  accountId?: string
  apiToken?: string
}

type WranglerProvisioningOutput = {
  wranglerVerified: boolean
  bucket?: { name: string; created: boolean }
  customDomain?: { name: string; attached: boolean; verified: boolean }
}

type WranglerCommandOutput = { exitCode: number; stdout: string; stderr: string }

const resultFailure = (message: string): Result<never> => resultErrorCreate("wranglerProvisioningRun", message)

type WranglerFailureReason = "not_found" | "bucket_not_found" | "authentication" | "permission" | "service" | "unknown"

const wranglerOutputRead = (result: { stdout: string; stderr: string }): string =>
  `${result.stderr}\n${result.stdout}`.toLocaleLowerCase()

const wranglerFailureReasonRead = (result: { stdout: string; stderr: string }): WranglerFailureReason => {
  const output = wranglerOutputRead(result)
  if (
    /\b(?:authentication|unauthenticated|credentials?|login)\b|\b(?:api|access) token\b|\b401\b|invalid token/u.test(
      output,
    )
  )
    return "authentication"
  if (/\b(?:permission|forbidden|unauthorized|access denied|not authorized)\b|\b403\b/u.test(output))
    return "permission"
  if (
    /\b(?:network|timeout|timed out|fetch failed|service unavailable|service failure|internal server|bad gateway|gateway timeout|upstream)\b|\b5\d\d\b|econn(?:refused|reset)/u.test(
      output,
    )
  )
    return "service"
  if (
    /\b(?:bucket|r2 bucket)\b[\s\S]{0,100}\b(?:not found|does not exist|no such)\b|bucket[_ -]+not[_ -]+found|(?:code\s*[:=]|"code"\s*:)\s*10006\b/u.test(
      output,
    )
  )
    return "bucket_not_found"
  if (/(?:code\s*[:=]|"code"\s*:)\s*10000\b/u.test(output)) return "authentication"
  if (/(?:code\s*[:=]|"code"\s*:)\s*10007\b|\b(?:not found|does not exist|no such|404)\b/u.test(output))
    return "not_found"
  return "unknown"
}

const wranglerFailureMessageRead = (description: string, reason: WranglerFailureReason, exitCode?: number): string => {
  if (reason === "authentication") return `Wrangler ${description} requires authentication`
  if (reason === "permission") return `Wrangler ${description} was not permitted`
  if (reason === "service") return `Wrangler ${description} was unavailable`
  if (reason === "not_found" || reason === "bucket_not_found")
    return `Wrangler ${description} could not find the requested resource`
  return exitCode === undefined
    ? `Wrangler ${description} failed`
    : `Wrangler ${description} exited with code ${exitCode}`
}

const profileArgumentsCreate = (args: readonly string[], profile: string | undefined): readonly string[] =>
  profile === undefined ? args : [...args, "--profile", profile]

const customDomainVerifiedRead = (stdout: string): boolean => {
  const withoutAnsi = stdout.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "gu"), "")
  const jsonStart = withoutAnsi.indexOf("{")
  const jsonEnd = withoutAnsi.lastIndexOf("}")
  let value: unknown
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      value = JSON.parse(withoutAnsi.slice(jsonStart, jsonEnd + 1))
    } catch {
      value = undefined
    }
  }
  if (Array.isArray(value)) value = value[0]
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (record.enabled === false || record.enabled === "false" || record.enabled === "no") return false
    if (typeof record.verified === "boolean") return record.verified
    if (typeof record.active === "boolean") return record.active
    if (typeof record.status === "string") return record.status.toLocaleLowerCase() === "active"
    if (record.status && typeof record.status === "object") {
      const status = record.status as Record<string, unknown>
      const ownership = typeof status.ownership === "string" ? status.ownership.toLocaleLowerCase() : undefined
      const ssl = typeof status.ssl === "string" ? status.ssl.toLocaleLowerCase() : undefined
      if (ownership !== undefined || ssl !== undefined) return ownership === "active" && ssl === "active"
      if (typeof status.verified === "boolean") return status.verified
    }
  }

  const enabled = /(?:^|\n)\s*enabled:\s*(yes|true|no|false)\s*$/imu.exec(withoutAnsi)?.[1]?.toLocaleLowerCase()
  if (enabled === "no" || enabled === "false") return false
  const ownership = /(?:^|\n)\s*ownership_status:\s*([^\s]+)\s*$/imu.exec(withoutAnsi)?.[1]
  const ssl = /(?:^|\n)\s*ssl_status:\s*([^\s]+)\s*$/imu.exec(withoutAnsi)?.[1]
  if (ownership !== undefined || ssl !== undefined)
    return enabled === "yes" || enabled === "true"
      ? ownership?.toLocaleLowerCase() === "active" && ssl?.toLocaleLowerCase() === "active"
      : false
  return false
}

const commandInvoke = async (
  runner: WranglerCommandRunner,
  args: readonly string[],
  profile: string | undefined,
  credentials: { accountId?: string; apiToken?: string },
): Promise<Result<WranglerCommandOutput>> => {
  let result: Awaited<ReturnType<WranglerCommandRunner>>
  try {
    result = await runner({
      args: profileArgumentsCreate(args, profile),
      ...(credentials.accountId === undefined ? {} : { accountId: credentials.accountId }),
      ...(credentials.apiToken === undefined ? {} : { apiToken: credentials.apiToken }),
    })
  } catch {
    return resultFailure("Wrangler command failed")
  }
  if (!result.success) return resultFailure("Wrangler command failed")
  return result
}

const commandRun = async (
  runner: WranglerCommandRunner,
  args: readonly string[],
  profile: string | undefined,
  credentials: { accountId?: string; apiToken?: string },
  description: string,
): Promise<Result<WranglerCommandOutput>> => {
  const result = await commandInvoke(runner, args, profile, credentials)
  if (!result.success) return result
  if (result.data.exitCode !== 0) {
    const reason = wranglerFailureReasonRead(result.data)
    return resultFailure(wranglerFailureMessageRead(description, reason, result.data.exitCode))
  }
  return result
}

export const wranglerProvisioningRun = async (
  runner: WranglerCommandRunner,
  input: WranglerProvisioningInput,
): Promise<Result<WranglerProvisioningOutput>> => {
  if (!input.createBucket && input.customDomain === undefined)
    return {
      success: true,
      data: { wranglerVerified: false },
    }

  const credentials = { accountId: input.accountId, apiToken: input.apiToken }
  const verified = await commandRun(runner, ["--version"], input.profile, credentials, "version check")
  if (!verified.success) return verified

  let bucketCreated = false
  if (input.createBucket) {
    const info = await commandInvoke(
      runner,
      ["r2", "bucket", "info", input.bucket, "--json"],
      input.profile,
      credentials,
    )
    if (!info.success) return info
    if (info.data.exitCode !== 0) {
      const reason = wranglerFailureReasonRead(info.data)
      if (reason !== "not_found" && reason !== "bucket_not_found")
        return resultFailure(wranglerFailureMessageRead("bucket lookup", reason, info.data.exitCode))
      const created = await commandRun(
        runner,
        ["r2", "bucket", "create", input.bucket],
        input.profile,
        credentials,
        "bucket creation",
      )
      if (!created.success) return created
      bucketCreated = true
    }
  }

  if (input.customDomain === undefined)
    return {
      success: true,
      data: {
        wranglerVerified: true,
        ...(input.createBucket ? { bucket: { name: input.bucket, created: bucketCreated } } : {}),
      },
    }

  const listedDomain = await commandInvoke(
    runner,
    ["r2", "bucket", "domain", "get", input.bucket, "--domain", input.customDomain],
    input.profile,
    credentials,
  )
  if (!listedDomain.success) return listedDomain
  let domainAttached = listedDomain.data.exitCode === 0
  let verifiedDomainData = listedDomain.data
  if (!domainAttached) {
    const reason = wranglerFailureReasonRead(listedDomain.data)
    if (reason === "bucket_not_found") return resultFailure("The target R2 bucket was not found")
    if (reason !== "not_found")
      return resultFailure(wranglerFailureMessageRead("custom domain lookup", reason, listedDomain.data.exitCode))
    const domainArguments = ["r2", "bucket", "domain", "add", input.bucket, "--domain", input.customDomain]
    if (input.zoneId !== undefined) domainArguments.push("--zone-id", input.zoneId)
    domainArguments.push("--force")
    const attached = await commandRun(runner, domainArguments, input.profile, credentials, "bucket domain attachment")
    if (!attached.success) return attached
    const verifiedDomain = await commandInvoke(
      runner,
      ["r2", "bucket", "domain", "get", input.bucket, "--domain", input.customDomain],
      input.profile,
      credentials,
    )
    if (!verifiedDomain.success) return verifiedDomain
    verifiedDomainData = verifiedDomain.data
    domainAttached = verifiedDomainData.exitCode === 0
  }
  if (!domainAttached) {
    const reason = wranglerFailureReasonRead(verifiedDomainData)
    if (reason === "bucket_not_found") return resultFailure("The target R2 bucket was not found")
    if (reason === "authentication") return resultFailure("Wrangler custom domain verification requires authentication")
    if (reason === "permission") return resultFailure("Wrangler custom domain verification was not permitted")
    if (reason === "service") return resultFailure("Wrangler custom domain verification was unavailable")
    return resultFailure(`The custom domain ${input.customDomain} could not be verified`)
  }

  return {
    success: true,
    data: {
      wranglerVerified: true,
      ...(input.createBucket ? { bucket: { name: input.bucket, created: bucketCreated } } : {}),
      customDomain: {
        name: input.customDomain,
        attached: domainAttached,
        verified: customDomainVerifiedRead(verifiedDomainData.stdout),
      },
    },
  }
}
