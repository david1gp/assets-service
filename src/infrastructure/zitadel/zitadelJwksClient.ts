import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelJwk } from "./zitadelJwk.js"

export type ZitadelJwksClient = {
  keysRead: (jwksUri: string, forceRefresh?: boolean) => Promise<Result<readonly ZitadelJwk[]>>
}
