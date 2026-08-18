import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import type { Result } from "../schemas/resultSchema.js"

export type ServiceBearerValidateOptions = {
  issuer: string
  audience: string
  jwksUri?: string
  jwksClient: ZitadelJwksClient
  discoveryRead?: () => Promise<Result<{ issuer: string; jwks_uri: string }>>
  organizationId: string
  serviceAccountClientId: string
  defaultProjectId?: string
  projectId?: string
  now?: () => number
  clockSkewSeconds?: number
}
