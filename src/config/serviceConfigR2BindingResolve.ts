import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ServiceConfig } from "./serviceConfigSchema.js"
import type { EnvironmentName } from "../schemas/environmentNameSchema.js"
import type { ServiceConfigR2Binding } from "./serviceConfigR2Binding.js"

export const serviceConfigR2BindingResolve = (
  config: ServiceConfig,
  environment: EnvironmentName = config.environment,
): Result<ServiceConfigR2Binding> => {
  const op = "serviceConfigR2BindingResolve"
  if (config.environment !== environment)
    return resultErrorCreate(op, "R2 binding environment did not match service configuration")
  const privateBucket = config.r2PrivateBucket ?? config.r2Bucket
  const publicBucket = config.r2PublicBucket ?? config.r2Bucket
  const publicBaseUrl = config.r2PublicBaseUrl
  return { success: true, data: { environment, privateBucket, publicBucket, publicBaseUrl } }
}
