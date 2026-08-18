import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const pkceCodeChallengeCreate = async (codeVerifier: string): Promise<Result<string>> => {
  const op = "pkceCodeChallengeCreate"
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))
    return { success: true, data: Buffer.from(digest).toString("base64url") }
  } catch (error) {
    return resultErrorCreate(op, "Unable to create the PKCE code challenge", error)
  }
}
