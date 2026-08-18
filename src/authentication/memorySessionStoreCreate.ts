import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { AuthenticationSession } from "./sessionSchema.js"
import type { SessionStore } from "./sessionStore.js"

type MemorySessionStoreOptions = {
  sessionIdCreate?: () => string
}

export const memorySessionStoreCreate = (options: MemorySessionStoreOptions = {}): SessionStore => {
  const sessions = new Map<string, AuthenticationSession>()
  const sessionIdCreate = options.sessionIdCreate ?? (() => crypto.randomUUID())
  const copy = (session: AuthenticationSession): AuthenticationSession => ({
    ...session,
    principal: {
      ...session.principal,
      grants: session.principal.grants.map((grant) => ({ ...grant, roles: [...grant.roles] })),
    },
  })

  return {
    async create(session): Promise<Result<string>> {
      const sessionId = sessionIdCreate()
      if (sessions.has(sessionId))
        return resultErrorCreate("memorySessionStoreCreate", "The session identifier already exists")
      sessions.set(sessionId, copy(session))
      return { success: true, data: sessionId }
    },
    async read(sessionId): Promise<Result<AuthenticationSession | null>> {
      const session = sessions.get(sessionId)
      return { success: true, data: session ? copy(session) : null }
    },
    async rotate(sessionId, session): Promise<Result<string>> {
      if (!sessions.has(sessionId)) return resultErrorCreate("memorySessionStoreRotate", "The session was not found")
      const nextSessionId = sessionIdCreate()
      if (sessions.has(nextSessionId))
        return resultErrorCreate("memorySessionStoreRotate", "The session identifier already exists")
      sessions.delete(sessionId)
      sessions.set(nextSessionId, copy(session))
      return { success: true, data: nextSessionId }
    },
    async revoke(sessionId): Promise<Result<undefined>> {
      sessions.delete(sessionId)
      return { success: true, data: undefined }
    },
  }
}
