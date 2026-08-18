import { createHash, randomBytes } from "node:crypto"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type AuthenticationSession, sessionSchema } from "./sessionSchema.js"
import type { SessionStore } from "./sessionStore.js"
import type { DatabaseConnection } from "../infrastructure/db/databaseConnection.js"
import * as v from "valibot"

export const databaseSessionStoreCreate = (connection: DatabaseConnection): Result<SessionStore> => {
  const op = "databaseSessionStoreCreate"
  try {
    connection.client.exec(`
      CREATE TABLE IF NOT EXISTS authentication_sessions (
        id_hash TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        rotate_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS authentication_sessions_expiry_index
        ON authentication_sessions (expires_at);
    `)
  } catch (error) {
    return resultErrorCreate(op, "The authentication session table could not be created", error)
  }

  const sessionIdCreate = (): string => randomBytes(32).toString("base64url")
  const hashCreate = (sessionId: string): string => createHash("sha256").update(sessionId).digest("hex")
  const sessionRead = (payload: string): Result<AuthenticationSession> => {
    try {
      const parsed = v.safeParse(sessionSchema, JSON.parse(payload))
      if (!parsed.success) return resultErrorCreate(op, "The stored authentication session was invalid")
      return { success: true, data: parsed.output }
    } catch (error) {
      return resultErrorCreate(op, "The stored authentication session was not valid JSON", error)
    }
  }
  const sessionCopy = (session: AuthenticationSession): AuthenticationSession => ({
    ...session,
    principal: {
      ...session.principal,
      grants: session.principal.grants.map((grant) => ({ ...grant, roles: [...grant.roles] })),
    },
  })

  const store: SessionStore = {
    async create(session): Promise<Result<string>> {
      const parsed = v.safeParse(sessionSchema, session)
      if (!parsed.success) return resultErrorCreate(op, "The authentication session was invalid")
      const value = sessionCopy(parsed.output)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const sessionId = sessionIdCreate()
        try {
          connection.client
            .prepare(
              "INSERT INTO authentication_sessions (id_hash, payload, created_at, expires_at, rotate_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(hashCreate(sessionId), JSON.stringify(value), value.createdAt, value.expiresAt, value.rotateAt)
          return { success: true, data: sessionId }
        } catch (error) {
          if (attempt === 2) return resultErrorCreate(op, "The authentication session could not be created", error)
        }
      }
      return resultErrorCreate(op, "The authentication session could not be created")
    },
    async read(sessionId): Promise<Result<AuthenticationSession | null>> {
      const row = connection.client
        .prepare("SELECT payload, expires_at FROM authentication_sessions WHERE id_hash = ?")
        .get(hashCreate(sessionId)) as { payload?: string; expires_at?: number } | null
      if (!row?.payload) return { success: true, data: null }
      if (typeof row.expires_at !== "number" || row.expires_at <= Math.floor(Date.now() / 1000)) {
        await store.revoke(sessionId)
        return { success: true, data: null }
      }
      const session = sessionRead(row.payload)
      return session.success ? { success: true, data: sessionCopy(session.data) } : session
    },
    async rotate(sessionId, session): Promise<Result<string>> {
      const nextSessionId = sessionIdCreate()
      const oldHash = hashCreate(sessionId)
      const nextHash = hashCreate(nextSessionId)
      try {
        connection.client.exec("BEGIN IMMEDIATE")
        const current = connection.client
          .prepare("SELECT id_hash FROM authentication_sessions WHERE id_hash = ?")
          .get(oldHash)
        if (!current) {
          connection.client.exec("ROLLBACK")
          return resultErrorCreate(op, "The session was not found")
        }
        const parsed = v.safeParse(sessionSchema, session)
        if (!parsed.success) {
          connection.client.exec("ROLLBACK")
          return resultErrorCreate(op, "The authentication session was invalid")
        }
        const value = sessionCopy(parsed.output)
        connection.client
          .prepare(
            "INSERT INTO authentication_sessions (id_hash, payload, created_at, expires_at, rotate_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(nextHash, JSON.stringify(value), value.createdAt, value.expiresAt, value.rotateAt)
        const deleted = connection.client
          .prepare("DELETE FROM authentication_sessions WHERE id_hash = ?")
          .run(oldHash) as { changes?: number }
        if (deleted.changes !== 1) {
          connection.client.exec("ROLLBACK")
          return resultErrorCreate(op, "The session rotation lost its compare-and-swap")
        }
        connection.client.exec("COMMIT")
        return { success: true, data: nextSessionId }
      } catch (error) {
        try {
          connection.client.exec("ROLLBACK")
        } catch {
          // The original error carries the useful operation context.
        }
        return resultErrorCreate(op, "The authentication session could not be rotated", error)
      }
    },
    async revoke(sessionId): Promise<Result<undefined>> {
      try {
        connection.client.prepare("DELETE FROM authentication_sessions WHERE id_hash = ?").run(hashCreate(sessionId))
        return { success: true, data: undefined }
      } catch (error) {
        return resultErrorCreate(op, "The authentication session could not be revoked", error)
      }
    },
  }
  return { success: true, data: store }
}
