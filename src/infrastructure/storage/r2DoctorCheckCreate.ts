import { serviceConfigR2BindingResolve } from "../../config/serviceConfigR2BindingResolve.js"
import type { ServiceConfig } from "../../config/serviceConfigSchema.js"
import type { DoctorCheckResult } from "../../doctor/doctorCheckResult.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { StorageAdapter } from "../../storage/storageAdapter.js"
import { customDomainProbe } from "./customDomainProbe.js"
import { r2CredentialProbe } from "./r2CredentialProbe.js"

type R2DoctorCheckOptions = {
  config: ServiceConfig
  adapter: StorageAdapter
  customDomainFetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export const r2DoctorCheckCreate = (options: R2DoctorCheckOptions) => async (): Promise<Result<DoctorCheckResult>> => {
  const binding = serviceConfigR2BindingResolve(options.config)
  if (!binding.success) return binding
  const credentials = await r2CredentialProbe(options.adapter, binding.data.privateBucket)
  if (!credentials.success) return credentials
  const domain = await customDomainProbe({
    baseUrl: binding.data.publicBaseUrl,
    ...(options.config.r2CustomDomainProbeKey ? { key: options.config.r2CustomDomainProbeKey } : {}),
    ...(options.config.r2CustomDomainProbeKey ? { expectedCacheControl: "public, max-age=31536000, immutable" } : {}),
    fetchImplementation: options.customDomainFetch,
  })
  if (!domain.success) return domain
  return {
    success: true,
    data: {
      message: "R2 credentials and public domain are reachable",
      details: {
        environment: binding.data.environment,
        privateBucket: binding.data.privateBucket,
        publicBucket: binding.data.publicBucket,
        publicBaseUrl: binding.data.publicBaseUrl,
        status: credentials.data.status,
        domainStatus: domain.data.status,
      },
    },
  }
}
