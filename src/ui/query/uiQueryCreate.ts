import { createEffect, onCleanup } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../storage/uiLocalStorageWrite.js"

export type UiQueryStatus = "idle" | "loading" | "ready" | "error"

export type UiQuery<T> = {
  status: () => UiQueryStatus
  data: () => T | null
  errorMessage: () => string | null
  reload: () => void
}

type UiQueryCacheOptions<T> = {
  cacheKey: () => string | undefined
  cacheSchema: v.GenericSchema<unknown, T>
  storage?: Storage
}

/**
 * Runs a reactive Result-returning read and tracks its loading, error, and data
 * states. The load function reruns whenever the reactive inputs it reads change.
 */
export const uiQueryCreate = <T>(load: () => Promise<Result<T>>, options?: UiQueryCacheOptions<T>): UiQuery<T> => {
  const status = createSignalObject<UiQueryStatus>("idle")
  const data = createSignalObject<T | null>(null)
  const errorMessage = createSignalObject<string | null>(null)
  const reloadToken = createSignalObject(0)

  let requestSequence = 0
  let disposed = false
  onCleanup(() => {
    disposed = true
  })

  const cacheHydrate = (key: string | undefined) => {
    if (options === undefined || key === undefined) return false
    const cached = uiLocalStorageRead(key, options.cacheSchema, options.storage)
    if (!cached.success || cached.data === undefined) return false
    data.set(cached.data)
    status.set("ready")
    return true
  }

  cacheHydrate(options?.cacheKey())

  createEffect(() => {
    reloadToken.get()
    const key = options?.cacheKey()
    requestSequence += 1
    const sequence = requestSequence
    const hasCachedData = cacheHydrate(key)
    if (!hasCachedData) {
      data.set(null)
      status.set("loading")
    }
    errorMessage.set(null)
    void load().then((result) => {
      if (disposed || sequence !== requestSequence) return
      if (!result.success) {
        errorMessage.set(result.errorMessage)
        if (!hasCachedData) status.set("error")
        return
      }
      let nextData = result.data
      if (options !== undefined && key !== undefined) {
        const parsed = v.safeParse(options.cacheSchema, result.data)
        if (!parsed.success) {
          errorMessage.set(v.summarize(parsed.issues))
          if (!hasCachedData) status.set("error")
          return
        }
        nextData = parsed.output
        void uiLocalStorageWrite(key, nextData, { storage: options.storage })
      }
      data.set(nextData)
      status.set("ready")
    })
  })

  return {
    status: status.get,
    data: data.get,
    errorMessage: errorMessage.get,
    reload: () => reloadToken.set(reloadToken.get() + 1),
  }
}
