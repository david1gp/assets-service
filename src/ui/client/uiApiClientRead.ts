import { assetsApiClientCreate } from "../../api-client/assetsApiClientCreate.js"
import type { Result } from "../../schemas/resultSchema.js"

export type UiApiClient = Extract<ReturnType<typeof assetsApiClientCreate>, { success: true }>["data"]

let cached: Result<UiApiClient> | null = null

/** Reads the shared browser API client bound to the serving origin. */
export const uiApiClientRead = (): Result<UiApiClient> => {
  if (cached) return cached
  cached = assetsApiClientCreate({
    apiUrl: window.location.origin,
    fetcher: (input, init) => fetch(input, { ...init, credentials: "same-origin" }),
  })
  return cached
}
