type ApiRequestFailureLogWriteInput = {
  requestId: string
  method: string
  path: string
  status: number
  code?: string
  response?: Response
  error?: unknown
}

type ErrorResponseDetails = {
  code?: string
  message?: string
}

type SanitizeState = {
  nodes: number
  seen: WeakSet<object>
}

const maxStringLength = 500
const maxStructuredDepth = 4
const maxStructuredEntries = 24
const maxStructuredNodes = 100
const redactedValue = "[REDACTED]"
const truncatedValue = "[TRUNCATED]"
const unsupportedValue = "[UNSERIALIZABLE]"
const urlPattern = /\b(?:https?|wss?):\/\/[^\s"'<>]+/giu
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu
const secretFieldPattern = "access[-_ ]?key[-_ ]?id|secret[-_ ]?access[-_ ]?key|revocation[-_ ]?id|api[-_ ]?token"
const secretAssignmentPattern = new RegExp(
  `(\\b(?:${secretFieldPattern}|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\\w-]+)\\b\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;]+)`,
  "giu",
)
const quotedSecretAssignmentPattern = new RegExp(
  `(["'])(${secretFieldPattern}|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\\w-]+)\\1(\\s*:\\s*)(?:"[^"]*"|'[^']*'|[^,}\\s]+)`,
  "giu",
)
const sensitiveKeyPattern = new RegExp(
  `(?:${secretFieldPattern}|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|session[-_ ]?(?:id|key|token)|id[-_ ]?(?:token|secret)|credential|headers?)`,
  "iu",
)

export const apiRequestFailureLogWrite = async (input: ApiRequestFailureLogWriteInput): Promise<void> => {
  try {
    const responseDetails = input.response === undefined ? undefined : await errorResponseDetailsRead(input.response)
    const errorDetails = input.error === undefined ? undefined : errorDetailsRead(input.error)
    const message = errorDetails?.message ?? responseDetails?.message
    const payload = {
      requestId: stringRead(input.requestId, 120),
      method: stringRead(input.method, 16),
      path: pathRead(input.path),
      status: input.status,
      ...(input.code === undefined && responseDetails?.code === undefined && errorDetails?.code === undefined
        ? {}
        : { code: input.code ?? responseDetails?.code ?? errorDetails?.code }),
      ...(message === undefined ? {} : { message }),
      ...(errorDetails?.name === undefined ? {} : { errorName: errorDetails.name }),
      ...(errorDetails?.cause === undefined ? {} : { cause: errorDetails.cause }),
    }

    console.error("[api/request failed]", payload)
  } catch {
    // Logging must never replace the API error response.
  }
}

const errorResponseDetailsRead = async (response: Response): Promise<ErrorResponseDetails | undefined> => {
  try {
    const body: unknown = await response.clone().json()
    if (!recordRead(body)) return undefined
    const error = body.error
    if (!recordRead(error)) return undefined
    return {
      ...(typeof error.code === "string" ? { code: stringRead(error.code, 120) } : {}),
      ...(typeof error.message === "string" ? { message: stringRead(error.message, maxStringLength) } : {}),
    }
  } catch {
    return undefined
  }
}

const errorDetailsRead = (error: unknown): { name?: string; code?: string; message?: string; cause?: unknown } => {
  if (error instanceof Error) {
    const record = recordRead(error) ? error : undefined
    const code = record === undefined ? undefined : propertyRead(record, "code")
    const cause = record === undefined ? undefined : propertyRead(record, "cause")
    return {
      name: stringRead(error.name || "Error", 120),
      ...(typeof code === "string" ? { code: stringRead(code, 120) } : {}),
      message: stringRead(error.message || error.name || "Unknown error", maxStringLength),
      ...(cause === undefined ? {} : { cause: valueSanitize(cause, 0, { nodes: 0, seen: new WeakSet<object>() }) }),
    }
  }
  if (typeof error === "string") return { message: stringRead(error, maxStringLength) }
  if (recordRead(error)) {
    const name = propertyRead(error, "name")
    const code = propertyRead(error, "code")
    const message = propertyRead(error, "message")
    const cause = propertyRead(error, "cause")
    return {
      ...(typeof name === "string" ? { name: stringRead(name, 120) } : {}),
      ...(typeof code === "string" ? { code: stringRead(code, 120) } : {}),
      ...(typeof message === "string" ? { message: stringRead(message, maxStringLength) } : {}),
      ...(cause === undefined ? {} : { cause: valueSanitize(cause, 0, { nodes: 0, seen: new WeakSet<object>() }) }),
    }
  }
  return { message: stringRead(String(error), maxStringLength) }
}

const pathRead = (path: string): string => {
  const queryStart = path.search(/[?#]/u)
  return stringRead(queryStart < 0 ? path : path.slice(0, queryStart), maxStringLength)
}

const stringRead = (value: string, maxLength: number): string => {
  const withoutUrls = value.replace(urlPattern, "[URL]")
  const withoutBearer = withoutUrls.replace(bearerPattern, `Bearer ${redactedValue}`)
  const withoutJwt = withoutBearer.replace(jwtPattern, redactedValue)
  const withoutAssignments = withoutJwt.replace(
    secretAssignmentPattern,
    (_match, prefix: string) => `${prefix}${redactedValue}`,
  )
  const withoutQuotedAssignments = withoutAssignments.replace(
    quotedSecretAssignmentPattern,
    (_match, quote: string, key: string, separator: string) => `${quote}${key}${quote}${separator}"${redactedValue}"`,
  )
  return withoutQuotedAssignments.replace(/\p{Cc}/gu, " ").slice(0, maxLength)
}

const recordRead = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object"

const propertyRead = (value: Record<string, unknown>, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return undefined
  return descriptor.value
}

const valueSanitize = (value: unknown, depth: number, state: SanitizeState): unknown => {
  state.nodes += 1
  if (state.nodes > maxStructuredNodes) return truncatedValue
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return typeof value === "number" && !Number.isFinite(value) ? unsupportedValue : value
  if (typeof value === "string") return stringRead(value, maxStringLength)
  if (typeof value !== "object") return unsupportedValue
  if (state.seen.has(value)) return "[CIRCULAR]"
  state.seen.add(value)

  try {
    if (depth >= maxStructuredDepth) return truncatedValue
    if (value instanceof Error) {
      const record = value as unknown as Record<string, unknown>
      const code = propertyRead(record, "code")
      const cause = propertyRead(record, "cause")
      return {
        name: stringRead(value.name || "Error", 120),
        message: stringRead(value.message || value.name || "Unknown error", maxStringLength),
        ...(typeof code === "string" ? { code: stringRead(code, 120) } : {}),
        ...(cause === undefined ? {} : { cause: valueSanitize(cause, depth + 1, state) }),
      }
    }
    const output: Record<string, unknown> = {}
    const keys = Object.keys(value)
    const length = Math.min(keys.length, maxStructuredEntries)
    for (let index = 0; index < length; index += 1) {
      const key = keys[index]
      if (key === undefined) continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      output[key.slice(0, maxStringLength)] =
        descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined
          ? unsupportedValue
          : sensitiveKeyPattern.test(key)
            ? redactedValue
            : valueSanitize(descriptor.value, depth + 1, state)
    }
    if (keys.length > length) output["..."] = truncatedValue
    return output
  } catch {
    return unsupportedValue
  } finally {
    state.seen.delete(value)
  }
}
