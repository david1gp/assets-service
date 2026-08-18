const redactedValue = "[REDACTED]"
const sensitiveKeyPattern =
  /[\w-]*(?:password|passphrase|secret|token|authorization|cookie|credential|private[_-]?key|access[_-]?key|client[_-]?secret|api[_-]?key|session|jwt)[\w-]*/i
const sensitiveAssignmentPattern = new RegExp(
  `(\\b${sensitiveKeyPattern.source}\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;]+)`,
  "gi",
)
const sensitiveQueryPattern =
  /([?&][\w-]*(?:password|passphrase|secret|token|signature|credential|api[_-]?key|access[_-]?key)[\w-]*=)[^&#\s]+/gi
const bearerPattern = /(\bBearer\s+)[^\s,;]+/gi
const basicAuthPattern = /(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi

export const doctorValueRedact = (value: unknown): unknown => redactValue(value, new WeakSet<object>())

function redactValue(value: unknown, seen: WeakSet<object>, key?: string): unknown {
  if (key !== undefined && sensitiveKeyPattern.test(key)) return redactedValue
  if (typeof value === "string") return redactString(value)
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return "[CIRCULAR]"

  seen.add(value)
  if (Array.isArray(value)) {
    const redacted = value.map((item) => redactValue(item, seen))
    seen.delete(value)
    return redacted
  }

  const redacted = Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, seen, entryKey)]),
  )
  seen.delete(value)
  return redacted
}

function redactString(value: string): string {
  return value
    .replace(sensitiveAssignmentPattern, `$1${redactedValue}`)
    .replace(sensitiveQueryPattern, `$1${redactedValue}`)
    .replace(bearerPattern, `$1${redactedValue}`)
    .replace(basicAuthPattern, `$1${redactedValue}@`)
}
