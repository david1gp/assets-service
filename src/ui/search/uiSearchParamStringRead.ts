/** Reads a non-empty string from a router search parameter value. */
export const uiSearchParamStringRead = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === "" ? undefined : trimmed
}
