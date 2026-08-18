import type { ZitadelJwk } from "../infrastructure/zitadel/zitadelJwk.js"
import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { jwtTokenParse } from "./jwtTokenParse.js"

export const jwtTokenSignatureVerify = async (
  token: Awaited<ReturnType<typeof jwtTokenParse>> & { success: true },
  jwksUri: string,
  jwksClient: ZitadelJwksClient,
): Promise<Result<boolean>> => {
  const op = "jwtTokenSignatureVerify"
  const algorithmByName = {
    RS256: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    RS384: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
    RS512: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
  } as const
  const algorithm = algorithmByName[token.data.header.alg as keyof typeof algorithmByName]
  if (!algorithm) return resultErrorCreate(op, "The JWT algorithm is not allowed")

  const firstRead = await jwksClient.keysRead(jwksUri)
  if (!firstRead.success) return firstRead
  let jwk: ZitadelJwk | undefined = firstRead.data.find((candidate) => candidate.kid === token.data.header.kid)
  if (!jwk) {
    const refreshed = await jwksClient.keysRead(jwksUri, true)
    if (!refreshed.success) return refreshed
    jwk = refreshed.data.find((candidate) => candidate.kid === token.data.header.kid)
  }
  if (jwk?.kty !== "RSA") return resultErrorCreate(op, "The JWT signing key was not found")
  if (jwk.alg && jwk.alg !== token.data.header.alg) return resultErrorCreate(op, "The JWT key algorithm did not match")
  if (jwk.use && jwk.use !== "sig") return resultErrorCreate(op, "The JWT key was not a signing key")

  try {
    const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"])
    return {
      success: true,
      data: await crypto.subtle.verify(
        algorithm,
        key,
        Buffer.from(token.data.signature),
        new TextEncoder().encode(token.data.signingInput),
      ),
    }
  } catch (error) {
    return resultErrorCreate(op, "The JWT signature could not be checked", error)
  }
}
