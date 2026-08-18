import type { ZitadelAuthConfig } from "../../authentication/zitadelAuthConfigSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelDoctorCheck } from "./zitadelDoctorCheckSchema.js"
import type { ZitadelDoctorReport } from "./zitadelDoctorReportSchema.js"
import type { ZitadelJwksClient } from "./zitadelJwksClient.js"
import type { ZitadelOidcClient } from "./zitadelOidcClient.js"

type ZitadelCredentialDoctorOptions = {
  config: ZitadelAuthConfig
  oidcClient: ZitadelOidcClient
  jwksClient: ZitadelJwksClient
  machineTokenCheck?: () => Promise<Result<unknown>>
}

const checkCreate = (
  name: ZitadelDoctorCheck["name"],
  status: ZitadelDoctorCheck["status"],
  message?: string,
): ZitadelDoctorCheck => ({
  name,
  status,
  ...(message ? { message } : {}),
})

export const zitadelCredentialDoctor = async (
  options: ZitadelCredentialDoctorOptions,
): Promise<Result<ZitadelDoctorReport>> => {
  const checks: ZitadelDoctorCheck[] = []
  let issuerUrl: URL
  try {
    issuerUrl = new URL(options.config.issuer)
  } catch (error) {
    return resultErrorCreate("zitadelCredentialDoctor", "The issuer URL was invalid", error)
  }
  const issuerSecure = issuerUrl.protocol === "https:" || ["localhost", "127.0.0.1", "::1"].includes(issuerUrl.hostname)
  checks.push(issuerSecure ? checkCreate("issuer", "ok") : checkCreate("issuer", "failed", "The issuer must use HTTPS"))

  const discovery = issuerSecure
    ? await options.oidcClient.discoveryRead()
    : resultErrorCreate("zitadelCredentialDoctor", "The issuer was not secure")
  if (!discovery.success) {
    checks.push(checkCreate("discovery", "failed", "The OIDC discovery check failed"))
    checks.push(checkCreate("jwks", "skipped", "Discovery did not provide a JWKS URI"))
  } else {
    checks.push(checkCreate("discovery", "ok"))
    const keys = await options.jwksClient.keysRead(discovery.data.jwks_uri, true)
    checks.push(keys.success ? checkCreate("jwks", "ok") : checkCreate("jwks", "failed", "The JWKS check failed"))
  }

  if (!options.machineTokenCheck) {
    checks.push(checkCreate("machine_token", "skipped", "No machine token check was configured"))
  } else {
    const machineToken = await options.machineTokenCheck()
    checks.push(
      machineToken.success
        ? checkCreate("machine_token", "ok")
        : checkCreate("machine_token", "failed", "The machine token check failed"),
    )
  }

  return { success: true, data: { healthy: checks.every((check) => check.status !== "failed"), checks } }
}
