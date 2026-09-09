import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiSessionAutoSignInPreferenceSchema } from "./uiSessionAutoSignInPreferenceSchema.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

/** Reads the browser-local automatic sign-in preference, defaulting to false if absent or invalid. */
export const uiSessionAutoSignInPreferenceRead = (storage?: Storage): boolean => {
  const result = uiLocalStorageRead(
    uiSessionAutoSignInStorageKeys.preference,
    uiSessionAutoSignInPreferenceSchema,
    storage,
  )
  if (!result.success || result.data === undefined) return false
  return result.data
}
