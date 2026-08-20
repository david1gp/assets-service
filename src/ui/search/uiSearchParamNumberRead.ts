import * as v from "valibot"
import { pageQuerySchema } from "../../api-client/pageQuerySchema.js"
import { uiSearchParamStringRead } from "./uiSearchParamStringRead.js"

/** Reads a non-negative integer from a router search parameter value. */
export const uiSearchParamNumberRead = (value: string | string[] | undefined): number | undefined => {
  const raw = uiSearchParamStringRead(value)
  if (raw === undefined) return undefined
  const parsed = v.safeParse(pageQuerySchema.entries.cursor, raw)
  return parsed.success ? parsed.output : undefined
}
