import * as v from "valibot"

import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { pkceCodeChallengeCreate } from "./pkceCodeChallengeCreate.js"
import type { PkceLoginInitiation } from "./pkceLoginInitiationSchema.js"
import type { PkceLoginRequest } from "./pkceLoginRequestSchema.js"
import { pkceLoginRequestSchema } from "./pkceLoginRequestSchema.js"
import type { PkceStateStore } from "./pkceStateStore.js"
import { sessionCookieCreate } from "./sessionCookieCreate.js"
import type { ZitadelAuthConfig } from "./zitadelAuthConfigSchema.js"

type HumanLoginInitiateOptions = {
  config: ZitadelAuthConfig
  stateStore: PkceStateStore
  oidcClient: ZitadelOidcClient
  now?: () => number
  randomBytes?: (size: number) => Uint8Array
}

const randomStringCreate = (size: number, randomBytes: (size: number) => Uint8Array): string =>
  Buffer.from(randomBytes(size)).toString("base64url")

export const humanLoginInitiate = async (
  request: PkceLoginRequest,
  options: HumanLoginInitiateOptions,
): Promise<Result<PkceLoginInitiation>> => {
  const op = "humanLoginInitiate"
  const parsedRequest = v.safeParse(pkceLoginRequestSchema, request)
  if (!parsedRequest.success) return resultErrorCreate(op, "The PKCE login request was invalid")
  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  const randomBytes = options.randomBytes ?? ((size) => crypto.getRandomValues(new Uint8Array(size)))
  const state = randomStringCreate(32, randomBytes)
  const codeVerifier = randomStringCreate(48, randomBytes)
  const nonce = randomStringCreate(32, randomBytes)
  const returnTo = parsedRequest.output.returnTo ?? "/"
  const expiresAt = now + 600
  const saved = await options.stateStore.save(state, { codeVerifier, nonce, returnTo, createdAt: now, expiresAt })
  if (!saved.success) return saved
  const challenge = await pkceCodeChallengeCreate(codeVerifier)
  if (!challenge.success) return challenge
  const authorizationUrl = await options.oidcClient.authorizationUrlCreate({
    returnTo,
    state,
    codeChallenge: challenge.data,
    nonce,
  })
  if (!authorizationUrl.success) return authorizationUrl

  const stateCookie = sessionCookieCreate(state, {
    name: options.config.stateCookieName,
    maxAgeSeconds: expiresAt - now,
  })
  if (!stateCookie) return resultErrorCreate(op, "The PKCE state cookie could not be created")
  return { success: true, data: { authorizationUrl: authorizationUrl.data, state, stateCookie, expiresAt } }
}
