import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { PkceState } from "./pkceStateSchema.js"
import type { PkceStateStore } from "./pkceStateStore.js"

type MemoryPkceStateStoreOptions = {
  now?: () => number
}

export const memoryPkceStateStoreCreate = (options: MemoryPkceStateStoreOptions = {}): PkceStateStore => {
  const states = new Map<string, PkceState>()
  const now = options.now ?? (() => Date.now())

  return {
    async save(state, value): Promise<Result<undefined>> {
      states.set(state, value)
      return { success: true, data: undefined }
    },
    async consume(state): Promise<Result<PkceState | null>> {
      const value = states.get(state) ?? null
      if (!value) return { success: true, data: null }
      states.delete(state)
      if (value.expiresAt <= Math.floor(now() / 1000)) {
        return resultErrorCreate("memoryPkceStateStoreConsume", "The PKCE state has expired")
      }
      return { success: true, data: value }
    },
  }
}
