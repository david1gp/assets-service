import * as v from "valibot"
import { uiSearchParamStringRead } from "./uiSearchParamStringRead.js"

/** Reads a search parameter through the supplied Valibot schema. */
export const uiSearchParamSchemaRead = <T>(
  schema: v.GenericSchema<unknown, T>,
  value: string | string[] | undefined,
): T | undefined => {
  const raw = uiSearchParamStringRead(value)
  if (raw === undefined) return undefined
  const parsed = v.safeParse(schema, raw)
  return parsed.success ? parsed.output : undefined
}
