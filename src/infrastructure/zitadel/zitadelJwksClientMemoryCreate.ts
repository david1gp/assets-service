import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelJwk } from "./zitadelJwk.js"
import type { ZitadelJwksClient } from "./zitadelJwksClient.js"

export const zitadelJwksClientMemoryCreate = (keys: readonly ZitadelJwk[]): ZitadelJwksClient => ({
  keysRead: async (): Promise<Result<readonly ZitadelJwk[]>> => ({ success: true, data: keys }),
})
