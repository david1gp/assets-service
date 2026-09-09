import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiSessionAutoSignInAttemptsSchema } from "./uiSessionAutoSignInAttemptsSchema.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

/** Reads the current automatic sign-in attempt count from browser storage, defaulting to 0. */
export const uiSessionAutoSignInAttemptsRead = (storage?: Storage): number => {
  const result = uiLocalStorageRead(uiSessionAutoSignInStorageKeys.attempts, uiSessionAutoSignInAttemptsSchema, storage)
  if (!result.success || result.data === undefined) return 0
  return result.data
}
