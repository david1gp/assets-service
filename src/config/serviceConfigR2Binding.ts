import type { EnvironmentName } from "../schemas/environmentNameSchema.js"

export type ServiceConfigR2Binding = {
  environment: EnvironmentName
  privateBucket: string
  publicBucket: string
  publicBaseUrl: string
}
