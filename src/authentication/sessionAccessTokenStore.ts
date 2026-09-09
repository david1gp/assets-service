import type { Result } from "../schemas/resultSchema.js"

export type SessionAccessTokenStore = {
  create: (accessToken: string, expiresAt: number) => Result<string>
  read: (reference: string, now?: number) => Result<string | null>
  revoke: (reference: string) => Result<undefined>
}
