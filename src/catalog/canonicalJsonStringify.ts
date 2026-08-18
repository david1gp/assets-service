const canonicalJsonValueSort = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJsonValueSort)
  if (value === null || typeof value !== "object") return value

  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalJsonValueSort((value as Record<string, unknown>)[key])]),
  )
}

export const canonicalJsonStringify = (value: unknown): string => {
  const serialized = JSON.stringify(canonicalJsonValueSort(value))
  return serialized ?? "null"
}
