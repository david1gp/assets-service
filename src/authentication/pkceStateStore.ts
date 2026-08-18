import type { Result } from "../schemas/resultSchema.js"
import type { PkceState } from "./pkceStateSchema.js"

export type PkceStateStore = {
  save: (state: string, value: PkceState) => Promise<Result<undefined>>
  consume: (state: string) => Promise<Result<PkceState | null>>
}
