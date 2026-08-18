import { createHash } from "node:crypto"
import * as v from "valibot"

import type { DatabaseConnection } from "../infrastructure/db/databaseConnection.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type PkceState, pkceStateSchema } from "./pkceStateSchema.js"
import type { PkceStateStore } from "./pkceStateStore.js"

export const databasePkceStateStoreCreate = (
  connection: DatabaseConnection,
  now: () => number = () => Date.now(),
): Result<PkceStateStore> => {
  const op = "databasePkceStateStoreCreate"
  try {
    connection.client.exec(`
      CREATE TABLE IF NOT EXISTS authentication_pkce_states (
        state_hash TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS authentication_pkce_states_expiry_index
        ON authentication_pkce_states (expires_at);
    `)
  } catch (error) {
    return resultErrorCreate(op, "The PKCE state table could not be created", error)
  }

  const hashCreate = (state: string): string => createHash("sha256").update(state).digest("hex")
  const stateRead = (payload: string): Result<PkceState> => {
    try {
      const parsed = v.safeParse(pkceStateSchema, JSON.parse(payload))
      if (!parsed.success) return resultErrorCreate(op, "The stored PKCE state was invalid")
      return { success: true, data: parsed.output }
    } catch (error) {
      return resultErrorCreate(op, "The stored PKCE state was not valid JSON", error)
    }
  }
  const store: PkceStateStore = {
    async save(state, value): Promise<Result<undefined>> {
      const parsed = v.safeParse(pkceStateSchema, value)
      if (!parsed.success) return resultErrorCreate(op, "The PKCE state was invalid")
      try {
        connection.client
          .prepare("INSERT INTO authentication_pkce_states (state_hash, payload, expires_at) VALUES (?, ?, ?)")
          .run(hashCreate(state), JSON.stringify(parsed.output), parsed.output.expiresAt)
        return { success: true, data: undefined }
      } catch (error) {
        return resultErrorCreate(op, "The PKCE state could not be saved", error)
      }
    },
    async consume(state): Promise<Result<PkceState | null>> {
      const hash = hashCreate(state)
      try {
        const row = connection.client
          .prepare("SELECT payload, expires_at FROM authentication_pkce_states WHERE state_hash = ?")
          .get(hash) as { payload?: string; expires_at?: number } | null
        if (!row?.payload) return { success: true, data: null }
        connection.client.prepare("DELETE FROM authentication_pkce_states WHERE state_hash = ?").run(hash)
        if (typeof row.expires_at !== "number" || row.expires_at <= Math.floor(now() / 1000))
          return resultErrorCreate(op, "The PKCE state has expired")
        return stateRead(row.payload)
      } catch (error) {
        return resultErrorCreate(op, "The PKCE state could not be consumed", error)
      }
    },
  }
  return { success: true, data: store }
}
