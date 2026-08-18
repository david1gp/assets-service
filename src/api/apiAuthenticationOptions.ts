import type { PkceStateStore } from "../authentication/pkceStateStore.js"
import type { SessionStore } from "../authentication/sessionStore.js"
import type { ZitadelAuthConfig } from "../authentication/zitadelAuthConfigSchema.js"
import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import type { RequestAuthenticationReadOptions } from "./apiRequestAuthenticationReadOptions.js"

export type ApiAuthenticationOptions = {
  config: ZitadelAuthConfig
  stateStore: PkceStateStore
  sessionStore: SessionStore
  oidcClient: ZitadelOidcClient
  jwksClient: ZitadelJwksClient
  serviceBearer: RequestAuthenticationReadOptions["serviceBearer"]
  now?: () => number
}
