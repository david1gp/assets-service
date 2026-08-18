import * as v from "valibot"

import { type ZitadelAuthConfig, zitadelAuthConfigSchema } from "../authentication/zitadelAuthConfigSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const zitadelAuthConfigRead = (environment: NodeJS.ProcessEnv = process.env): Result<ZitadelAuthConfig> => {
  const parsed = v.safeParse(zitadelAuthConfigSchema, {
    issuer: environment.ZITADEL_ISSUER,
    clientId: environment.ZITADEL_CLIENT_ID,
    ...(environment.ZITADEL_SERVICE_ACCOUNT_CLIENT_ID
      ? { serviceAccountClientId: environment.ZITADEL_SERVICE_ACCOUNT_CLIENT_ID }
      : {}),
    redirectUri: environment.ZITADEL_REDIRECT_URI,
    audience: environment.ZITADEL_AUDIENCE,
    organizationId: environment.ZITADEL_ORGANIZATION_ID,
    projectId: environment.ZITADEL_PROJECT_ID,
    sessionCookieName: environment.ASSETS_SESSION_COOKIE_NAME ?? "assets_session",
    stateCookieName: environment.ASSETS_STATE_COOKIE_NAME ?? "assets_state",
    sessionTtlSeconds: Number(environment.ASSETS_SESSION_TTL_SECONDS ?? 28800),
    sessionRotationSeconds: Number(environment.ASSETS_SESSION_ROTATION_SECONDS ?? 900),
    clockSkewSeconds: Number(environment.ASSETS_AUTH_CLOCK_SKEW_SECONDS ?? 30),
    jwksCacheTtlSeconds: Number(environment.ASSETS_JWKS_CACHE_TTL_SECONDS ?? 300),
  })
  if (!parsed.success) return resultErrorCreate("zitadelAuthConfigRead", v.summarize(parsed.issues))
  return { success: true, data: parsed.output }
}
