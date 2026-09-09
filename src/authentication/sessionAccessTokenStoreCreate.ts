import { randomBytes } from "node:crypto"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { SessionAccessTokenStore } from "./sessionAccessTokenStore.js"

export const sessionAccessTokenStoreCreate = (): SessionAccessTokenStore => {
  const credentials = new Map<string, { accessToken: string; expiresAt: number }>()
  const referenceCreate = (): string => randomBytes(32).toString("base64url")

  return {
    create(accessToken: string, expiresAt: number): Result<string> {
      if (accessToken.length === 0 || !Number.isInteger(expiresAt) || expiresAt < 1)
        return resultErrorCreate("sessionAccessTokenStoreCreate", "The session access token was invalid")
      const reference = referenceCreate()
      credentials.set(reference, { accessToken, expiresAt })
      return { success: true, data: reference }
    },
    read(reference: string, now = Math.floor(Date.now() / 1000)): Result<string | null> {
      const credential = credentials.get(reference)
      if (credential === undefined) return { success: true, data: null }
      if (credential.expiresAt <= now) {
        credentials.delete(reference)
        return { success: true, data: null }
      }
      return { success: true, data: credential.accessToken }
    },
    revoke(reference: string): Result<undefined> {
      credentials.delete(reference)
      return { success: true, data: undefined }
    },
  }
}
