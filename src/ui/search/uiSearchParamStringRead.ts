import * as v from "valibot"

const searchParamStringSchema = v.pipe(
  v.string(),
  v.transform((value) => value.trim()),
  v.minLength(1),
)

/** Reads a non-empty string from a router search parameter value. */
export const uiSearchParamStringRead = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined) return undefined
  const parsed = v.safeParse(searchParamStringSchema, raw)
  return parsed.success ? parsed.output : undefined
}
