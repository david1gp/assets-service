import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInAttemptsRead } from "./uiSessionAutoSignInAttemptsRead.js"
import { uiSessionAutoSignInMaxAttempts } from "./uiSessionAutoSignInMaxAttempts.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

export type UiSessionAutoSignInAttemptResult = {
  allowed: boolean
  attempts: number
}

/**
 * Checks and records an automatic sign-in attempt. If the budget is exhausted,
 * disallows further automatic attempts without throwing or modifying the preference.
 */
export const uiSessionAutoSignInAttemptRecord = (storage?: Storage): Result<UiSessionAutoSignInAttemptResult> => {
  const op = "uiSessionAutoSignInAttemptRecord"
  const currentAttempts = uiSessionAutoSignInAttemptsRead(storage)
  if (currentAttempts >= uiSessionAutoSignInMaxAttempts) {
    return { success: true, data: { allowed: false, attempts: currentAttempts } }
  }

  const nextAttempts = currentAttempts + 1
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) {
      return resultErrorCreate(op, ttc("localStorage is unavailable", "localStorage ist nicht verfügbar"))
    }
    target.setItem(uiSessionAutoSignInStorageKeys.attempts, JSON.stringify(nextAttempts))
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

  return { success: true, data: { allowed: true, attempts: nextAttempts } }
}
