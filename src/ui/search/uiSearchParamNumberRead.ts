import { uiSearchParamStringRead } from "./uiSearchParamStringRead.js"

/** Reads a non-negative integer from a router search parameter value. */
export const uiSearchParamNumberRead = (value: string | string[] | undefined): number | undefined => {
  const raw = uiSearchParamStringRead(value)
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
