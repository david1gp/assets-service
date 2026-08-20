import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"

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
    if (target === undefined) return resultErrorCreate(op, "localStorage is unavailable")
    raw = target.getItem(key)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The storage operation failed"
    return resultErrorCreate(op, `Could not read localStorage: ${message}`)
  }

  if (raw === null) return { success: true, data: undefined }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return resultErrorCreate(op, `The localStorage value for ${key} was not valid JSON`)
  }

  const parsed = v.safeParse(schema, value)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), value)
  return { success: true, data: parsed.output }
}
