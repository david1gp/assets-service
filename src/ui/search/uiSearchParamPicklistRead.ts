import * as v from "valibot"
import { uiSearchParamStringRead } from "./uiSearchParamStringRead.js"

/** Reads a search parameter value that must belong to a known option set. */
export const uiSearchParamPicklistRead = <T extends string>(
  schema: v.GenericSchema<unknown, T>,
  value: string | string[] | undefined,
): T | undefined => {
  const raw = uiSearchParamStringRead(value)
  if (raw === undefined) return undefined
  const parsed = v.safeParse(schema, raw)
  return parsed.success ? parsed.output : undefined
}
