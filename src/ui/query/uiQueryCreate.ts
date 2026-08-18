import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { createEffect, onCleanup } from "solid-js"
import type { Result } from "../../schemas/resultSchema.js"

export type UiQueryStatus = "idle" | "loading" | "ready" | "error"

export type UiQuery<T> = {
  status: () => UiQueryStatus
  data: () => T | null
  errorMessage: () => string | null
  reload: () => void
}

/**
 * Runs a reactive Result-returning read and tracks its loading, error, and data
 * states. The load function reruns whenever the reactive inputs it reads change.
 */
export const uiQueryCreate = <T>(load: () => Promise<Result<T>>): UiQuery<T> => {
  const status = createSignalObject<UiQueryStatus>("idle")
  const data = createSignalObject<T | null>(null)
  const errorMessage = createSignalObject<string | null>(null)
  const reloadToken = createSignalObject(0)

  let requestSequence = 0
  let disposed = false
  onCleanup(() => {
    disposed = true
  })

  createEffect(() => {
    reloadToken.get()
    const sequence = (requestSequence += 1)
    status.set("loading")
    errorMessage.set(null)
    void load().then((result) => {
      if (disposed || sequence !== requestSequence) return
      if (!result.success) {
        errorMessage.set(result.errorMessage)
        status.set("error")
        return
      }
      data.set(result.data)
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
