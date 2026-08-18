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
  const environmentBucket = environment === "development" ? config.r2DevelopmentBucket : config.r2ProductionBucket
  const environmentPublicBaseUrl =
    environment === "development" ? config.r2DevelopmentPublicBaseUrl : config.r2ProductionPublicBaseUrl
  const privateBucket = config.r2PrivateBucket ?? environmentBucket ?? config.r2Bucket
  const publicBucket = config.r2PublicBucket ?? environmentBucket ?? config.r2Bucket
  const publicBaseUrl = environmentPublicBaseUrl ?? config.r2PublicBaseUrl
  if (environmentBucket !== undefined && environmentPublicBaseUrl === undefined) {
    return resultErrorCreate(op, "An environment-specific R2 bucket requires an environment-specific public domain")
  }
  if (environmentPublicBaseUrl !== undefined && environmentBucket === undefined) {
    return resultErrorCreate(op, "An environment-specific public domain requires an environment-specific R2 bucket")
  }
  return { success: true, data: { environment, privateBucket, publicBucket, publicBaseUrl } }
}
