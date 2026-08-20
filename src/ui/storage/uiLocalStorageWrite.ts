import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiIdleCallbackSchedule } from "../common/uiIdleCallbackSchedule.js"

const defaultDebounceMilliseconds = 150

type PendingLocalStorageWrite = {
  timer: ReturnType<typeof setTimeout> | undefined
  cancelIdle: (() => void) | undefined
  run: () => Result<true>
  resolvers: Array<(result: Result<true>) => void>
}

const pendingWrites = new Map<string, PendingLocalStorageWrite>()

const localStorageWriteRun = (key: string, serialized: string | undefined, storage?: Storage): Result<true> => {
  const op = "uiLocalStorageWrite"
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) return resultErrorCreate(op, "localStorage is unavailable")
    if (serialized === undefined) target.removeItem(key)
    else target.setItem(key, serialized)
    return { success: true, data: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The storage operation failed"
    return resultErrorCreate(op, `Could not write localStorage: ${message}`)
  }
}

/** Debounces a JSON localStorage write and schedules it during browser idle time; null or undefined removes the key. */
export const uiLocalStorageWrite = (
  key: string,
  value?: unknown,
  options?: { debounceMilliseconds?: number; storage?: Storage },
): Promise<Result<true>> => {
  const op = "uiLocalStorageWrite"
  let serialized: string | undefined
  if (value !== null && value !== undefined) {
    try {
      serialized = JSON.stringify(value)
    } catch (error) {
      const message = error instanceof Error ? error.message : "The value could not be serialized"
      return Promise.resolve(resultErrorCreate(op, `Could not serialize localStorage value: ${message}`))
    }
    if (serialized === undefined)
      return Promise.resolve(resultErrorCreate(op, "Could not serialize localStorage value"))
  }

  return new Promise((resolve) => {
    const existing = pendingWrites.get(key)
    const entry = existing ?? {
      timer: undefined,
      cancelIdle: undefined,
      run: () => resultErrorCreate(op, "The localStorage write was not scheduled"),
      resolvers: [],
    }
    if (existing?.timer !== undefined) globalThis.clearTimeout(existing.timer)
    existing?.cancelIdle?.()
    entry.run = () => localStorageWriteRun(key, serialized, options?.storage)
    entry.resolvers.push(resolve)
    entry.timer = globalThis.setTimeout(
      () => {
        entry.timer = undefined
        entry.cancelIdle = uiIdleCallbackSchedule(() => {
          if (pendingWrites.get(key) !== entry) return
          pendingWrites.delete(key)
          const result = entry.run()
          for (const resolver of entry.resolvers) resolver(result)
        })
      },
      Math.max(0, options?.debounceMilliseconds ?? defaultDebounceMilliseconds),
    )
    pendingWrites.set(key, entry)
  })
}
