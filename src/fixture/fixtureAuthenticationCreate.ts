import { memoryPkceStateStoreCreate } from "../authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../authentication/memorySessionStoreCreate.js"
import type { AuthenticationSession } from "../authentication/sessionSchema.js"
import type { ZitadelAuthConfig } from "../authentication/zitadelAuthConfigSchema.js"
import type { ApiAuthenticationOptions } from "../api/apiAuthenticationOptions.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export type FixtureAuthentication = {
  options: ApiAuthenticationOptions
  sessionCreate: () => Promise<Result<string>>
  config: ZitadelAuthConfig
}

const configCreate = (origin: string): ZitadelAuthConfig => ({
  issuer: "https://identity.fixture.invalid",
  clientId: "fixture-client",
  redirectUri: `${origin}/api/v1/auth/callback`,
  audience: "assets-api-fixture",
  organizationId: "org-fixture",
  projectId: "zitadel-fixture",
  sessionCookieName: "assets_session",
  stateCookieName: "assets_state",
  sessionTtlSeconds: 3600,
  sessionRotationSeconds: 900,
  clockSkewSeconds: 0,
  jwksCacheTtlSeconds: 60,
})

/**
 * Authentication wiring for the seeded fixture server. It never talks to an
 * identity provider: the login route hands out a local session for the seeded
 * admin. Production composition keeps using the Zitadel adapters, so this file
 * is only reachable from the fixture entrypoint and its tests.
 */
export const fixtureAuthenticationCreate = (options: {
  origin: string
  subjectId: string
  projectId: string
}): FixtureAuthentication => {
  const config = configCreate(options.origin)
  const sessionStore = memorySessionStoreCreate()
  const stateStore = memoryPkceStateStoreCreate()

  const sessionCreate = async (): Promise<Result<string>> => {
    const issuedAt = Math.floor(Date.now() / 1000)
    const session: AuthenticationSession = {
      principal: {
        subjectId: options.subjectId,
        organizationId: config.organizationId,
        method: "human_session",
        grants: [{ projectId: options.projectId, roles: ["assets.uploader", "assets.admin"] }],
        issuedAt,
        expiresAt: issuedAt + config.sessionTtlSeconds,
      },
      createdAt: issuedAt,
      expiresAt: issuedAt + config.sessionTtlSeconds,
      rotateAt: issuedAt + config.sessionRotationSeconds,
    }
    return sessionStore.create(session)
  }

  const oidcClient = {
    discoveryRead: async () =>
      resultErrorCreate("fixtureOidcDiscoveryRead", "The fixture server has no identity provider"),
    authorizationUrlCreate: async () =>
      resultErrorCreate("fixtureAuthorizationUrlCreate", "The fixture server has no identity provider"),
    authorizationCodeExchange: async () =>
      resultErrorCreate("fixtureAuthorizationCodeExchange", "The fixture server has no identity provider"),
  }
  const jwksClient = {
    keysRead: async () => resultErrorCreate("fixtureJwksKeysRead", "The fixture server has no identity provider"),
  }

  return {
    config,
    sessionCreate,
    options: {
      config,
      stateStore,
      sessionStore,
      oidcClient,
      jwksClient,
      serviceBearer: undefined,
    },
  }
}
