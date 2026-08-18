import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelJwk } from "./zitadelJwk.js"
import type { ZitadelJwksClient } from "./zitadelJwksClient.js"

const jwksResponseSchema = v.object({
  keys: v.pipe(v.array(v.record(v.string(), v.unknown())), v.minLength(1)),
})

type ZitadelJwksClientOptions = {
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  now?: () => number
  ttlSeconds: number
}

export const zitadelJwksClientCreate = (options: ZitadelJwksClientOptions): ZitadelJwksClient => {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? (() => Date.now())
  const cache = new Map<string, { expiresAt: number; keys: readonly ZitadelJwk[] }>()

  const keysRead = async (jwksUri: string, forceRefresh = false): Promise<Result<readonly ZitadelJwk[]>> => {
    const cached = cache.get(jwksUri)
    if (!forceRefresh && cached && cached.expiresAt > now()) return { success: true, data: cached.keys }

    let response: Response
    try {
      response = await fetcher(jwksUri, { headers: { accept: "application/json" } })
    } catch (error) {
      return resultErrorCreate("zitadelJwksClientRead", "Unable to reach the Zitadel JWKS endpoint", error)
    }
    if (!response.ok) return resultErrorCreate("zitadelJwksClientRead", "The Zitadel JWKS endpoint returned an error")

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      return resultErrorCreate("zitadelJwksClientRead", "The Zitadel JWKS response was not valid JSON", error)
    }
    const parsed = v.safeParse(jwksResponseSchema, body)
    if (!parsed.success) return resultErrorCreate("zitadelJwksClientRead", "The Zitadel JWKS response was invalid")

    const keys = parsed.output.keys as unknown as readonly ZitadelJwk[]
    cache.set(jwksUri, { expiresAt: now() + options.ttlSeconds * 1000, keys })
    return { success: true, data: keys }
  }

  return { keysRead }
}
