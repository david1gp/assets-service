import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiIdleCallbackSchedule } from "../common/uiIdleCallbackSchedule.js"
import { ttc } from "../localization/ttc.js"

const defaultDebounceMilliseconds = 150

type SearchParamsReplaceOptions = {
  debounceMilliseconds?: number
  location?: Pick<Location, "pathname" | "hash">
  replaceState?: (url: string) => void
}

type PendingSearchParamsReplace = {
  timer: ReturnType<typeof setTimeout> | undefined
  cancelIdle: (() => void) | undefined
  run: () => Result<true>
  resolvers: Array<(result: Result<true>) => void>
}

let pendingReplacement: PendingSearchParamsReplace | undefined

const searchParamsReplaceRun = (search: string, options: SearchParamsReplaceOptions): Result<true> => {
  const op = "uiSearchParamsReplace"
  try {
    const targetLocation = options.location ?? (typeof window === "undefined" ? undefined : window.location)
    if (targetLocation === undefined)
      return resultErrorCreate(
        op,
        ttc("The browser location is unavailable", "Die Browser-Adresse ist nicht verfügbar"),
      )

    const replaceState =
      options.replaceState ??
      ((url: string) => {
        if (typeof window === "undefined")
          throw new Error(ttc("The browser history is unavailable", "Der Browser-Verlauf ist nicht verfügbar"))
        window.history.replaceState(window.history.state, "", url)
      })
    replaceState(`${targetLocation.pathname}${search}${targetLocation.hash}`)
    return { success: true, data: true }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : ttc("The browser history operation failed", "Der Browser-Verlauf konnte nicht geändert werden")
    return resultErrorCreate(
      op,
      `${ttc("Could not replace the URL search", "Die URL-Suche konnte nicht ersetzt werden")}: ${message}`,
    )
  }
}

/** Debounces an encoded search string and replaces the current URL during browser idle time. */
export const uiSearchParamsReplace = (
  search: string | URLSearchParams,
  options: SearchParamsReplaceOptions = {},
): Promise<Result<true>> => {
  const query = typeof search === "string" ? search.replace(/^\?/, "") : search.toString()
  const normalizedSearch = query === "" ? "" : `?${query}`
  const operationOptions = options

  return new Promise((resolve) => {
    const existing = pendingReplacement
    const entry = existing ?? {
      timer: undefined,
      cancelIdle: undefined,
      run: () =>
        resultErrorCreate(
          "uiSearchParamsReplace",
          ttc("The URL search replacement was not scheduled", "Das Ersetzen der URL-Suche wurde nicht eingeplant"),
        ),
      resolvers: [],
    }
    if (existing?.timer !== undefined) globalThis.clearTimeout(existing.timer)
    existing?.cancelIdle?.()
    entry.run = () => searchParamsReplaceRun(normalizedSearch, operationOptions)
    entry.resolvers.push(resolve)
    entry.timer = globalThis.setTimeout(
      () => {
        entry.timer = undefined
        entry.cancelIdle = uiIdleCallbackSchedule(() => {
          if (pendingReplacement !== entry) return
          pendingReplacement = undefined
          const result = entry.run()
          for (const resolver of entry.resolvers) resolver(result)
        })
      },
      Math.max(0, options.debounceMilliseconds ?? defaultDebounceMilliseconds),
    )
    pendingReplacement = entry
  })
}
