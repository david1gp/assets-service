import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInMaxAttempts } from "./uiSessionAutoSignInMaxAttempts.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

/** Sets the attempt counter to the maximum to pause automatic sign-in (e.g. after deliberate logout). */
export const uiSessionAutoSignInAttemptsExhaust = (storage?: Storage): Result<true> => {
  const op = "uiSessionAutoSignInAttemptsExhaust"
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) {
      return resultErrorCreate(op, ttc("localStorage is unavailable", "localStorage ist nicht verfügbar"))
    }
    target.setItem(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(uiSessionAutoSignInMaxAttempts))
    return { success: true, data: true }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : ttc("The storage operation failed", "Der Speichervorgang ist fehlgeschlagen")
    return resultErrorCreate(
      op,
      `${ttc("Could not write localStorage", "localStorage konnte nicht geschrieben werden")}: ${message}`,
    )
  }
}
