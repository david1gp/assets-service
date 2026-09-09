import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

/** Resets the automatic sign-in attempt counter in browser storage. */
export const uiSessionAutoSignInAttemptsReset = (storage?: Storage): Result<true> => {
  const op = "uiSessionAutoSignInAttemptsReset"
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) {
      return resultErrorCreate(op, ttc("localStorage is unavailable", "localStorage ist nicht verfügbar"))
    }
    target.removeItem(uiSessionAutoSignInStorageKeys.attempts)
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
