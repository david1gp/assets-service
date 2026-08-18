import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticationSession } from "./sessionSchema.js"

export type SessionStore = {
  create: (session: AuthenticationSession) => Promise<Result<string>>
  read: (sessionId: string) => Promise<Result<AuthenticationSession | null>>
  rotate: (sessionId: string, session: AuthenticationSession) => Promise<Result<string>>
  revoke: (sessionId: string) => Promise<Result<undefined>>
}
