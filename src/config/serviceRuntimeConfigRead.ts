import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ServiceRuntimeConfig } from "./serviceRuntimeConfig.js"
import { serviceConfigRead } from "./serviceConfigRead.js"
import { zitadelAuthConfigRead } from "./zitadelAuthConfigRead.js"

export const serviceRuntimeConfigRead = (
  environment: NodeJS.ProcessEnv = process.env,
): Result<ServiceRuntimeConfig> => {
  const service = serviceConfigRead(environment)
  if (!service.success) return service
  const zitadel = zitadelAuthConfigRead(environment)
  if (!zitadel.success) return resultErrorCreate("serviceRuntimeConfigRead", zitadel.errorMessage, zitadel.rawData)
  return { success: true, data: { service: service.data, zitadel: zitadel.data } }
}
