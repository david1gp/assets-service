import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"

/** Reads and validates a JSON value from localStorage. */
export const uiLocalStorageRead = <T>(
  key: string,
  schema: v.GenericSchema<unknown, T>,
  storage?: Storage,
): Result<T | undefined> => {
  const op = "uiLocalStorageRead"
  let raw: string | null
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined)
      return resultErrorCreate(op, ttc("localStorage is unavailable", "localStorage ist nicht verfügbar"))
    raw = target.getItem(key)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : ttc("The storage operation failed", "Der Speichervorgang ist fehlgeschlagen")
    return resultErrorCreate(
      op,
      `${ttc("Could not read localStorage", "localStorage konnte nicht gelesen werden")}: ${message}`,
    )
  }

  if (raw === null) return { success: true, data: undefined }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return resultErrorCreate(
      op,
      ttc(
        `The localStorage value for ${key} was not valid JSON`,
        `Der localStorage-Wert für ${key} war kein gültiges JSON`,
      ),
    )
  }

  const parsed = v.safeParse(schema, value)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), value)
  return { success: true, data: parsed.output }
}
