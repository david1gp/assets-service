import type { ZitadelAuthConfig } from "../../authentication/zitadelAuthConfigSchema.js"
import type { DoctorCheckResult } from "../../doctor/doctorCheckResult.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { zitadelCredentialDoctor } from "./zitadelCredentialDoctor.js"
import type { ZitadelJwksClient } from "./zitadelJwksClient.js"
import type { ZitadelOidcClient } from "./zitadelOidcClient.js"

type ZitadelDoctorCheckOptions = {
  config: ZitadelAuthConfig
  oidcClient: ZitadelOidcClient
  jwksClient: ZitadelJwksClient
  machineTokenCheck?: () => Promise<Result<unknown>>
}

export const zitadelDoctorCheckCreate =
  (options: ZitadelDoctorCheckOptions) => async (): Promise<Result<DoctorCheckResult>> => {
    const report = await zitadelCredentialDoctor(options)
    if (!report.success) return report
    if (!report.data.healthy) {
      return resultErrorCreate("zitadelDoctorCheckCreate", "One or more Zitadel checks failed", {
        checks: report.data.checks.filter((check) => check.status === "failed").map((check) => check.name),
      })
    }
    return {
      success: true,
      data: { message: "Zitadel issuer, discovery, and JWKS are reachable", details: { checks: report.data.checks } },
    }
  }
