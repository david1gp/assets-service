import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiIdleCallbackSchedule } from "../common/uiIdleCallbackSchedule.js"

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
    if (targetLocation === undefined) return resultErrorCreate(op, "The browser location is unavailable")

    const replaceState =
      options.replaceState ??
      ((url: string) => {
        if (typeof window === "undefined") throw new Error("The browser history is unavailable")
        window.history.replaceState(window.history.state, "", url)
      })
    replaceState(`${targetLocation.pathname}${search}${targetLocation.hash}`)
    return { success: true, data: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The browser history operation failed"
    return resultErrorCreate(op, `Could not replace the URL search: ${message}`)
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
      run: () => resultErrorCreate("uiSearchParamsReplace", "The URL search replacement was not scheduled"),
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
