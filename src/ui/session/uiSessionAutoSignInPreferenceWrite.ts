import * as v from "valibot"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInAttemptsReset } from "./uiSessionAutoSignInAttemptsReset.js"
import { uiSessionAutoSignInPreferenceSchema } from "./uiSessionAutoSignInPreferenceSchema.js"
import { uiSessionAutoSignInStorageKeys } from "./uiSessionAutoSignInStorageKeys.js"

/** Writes the browser-local automatic sign-in preference and resets the attempt budget. */
export const uiSessionAutoSignInPreferenceWrite = (enabled: boolean, storage?: Storage): Result<true> => {
  const op = "uiSessionAutoSignInPreferenceWrite"
  const parsed = v.safeParse(uiSessionAutoSignInPreferenceSchema, enabled)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), enabled)

  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) {
      return resultErrorCreate(op, ttc("localStorage is unavailable", "localStorage ist nicht verfügbar"))
    }
    target.setItem(uiSessionAutoSignInStorageKeys.preference, JSON.stringify(parsed.output))
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

  uiSessionAutoSignInAttemptsReset(storage)
  return { success: true, data: true }
}
