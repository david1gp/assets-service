import type { ZitadelAuthConfig } from "../authentication/zitadelAuthConfigSchema.js"
import type { ServiceConfig } from "./serviceConfigSchema.js"

export type ServiceRuntimeConfig = {
  service: ServiceConfig
  zitadel: ZitadelAuthConfig
}
