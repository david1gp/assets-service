import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type ApiClientErrorKind = "network" | "http" | "invalid-response"

type ApiClientErrorInput = {
  operation: string
  message: string
  kind: ApiClientErrorKind
  method: string
  phase: string
  target?: string | URL
  status?: number
  statusText?: string
  cause?: unknown
  responseDetail?: unknown
  rawData?: unknown
  redactionSecrets?: readonly (string | undefined)[]
}

type SanitizeState = {
  nodes: number
  seen: WeakSet<object>
  secrets: readonly string[]
}

const maxCauseLength = 240
const maxResponseDetailLength = 500
const maxStringLength = 500
const maxStructuredDepth = 4
const maxStructuredEntries = 24
const maxStructuredNodes = 200
const redactedValue = "[REDACTED]"
const truncatedValue = "[TRUNCATED]"
const unsupportedValue = "[UNSERIALIZABLE]"
const urlPattern = /\b(?:https?|wss?):\/\/[^\s"'<>]+/giu
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu
const secretAssignmentPattern =
  /(\b(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\w-]+)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu
const quotedSecretAssignmentPattern =
  /(["'])(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\w-]+)\1(\s*:\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/giu
const sensitiveKeyPattern =
  /(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?(?:token|secret)|credential|headers?)/iu

export const apiClientErrorCreate = (input: ApiClientErrorInput): Result<never> => {
  const secrets = (input.redactionSecrets ?? []).filter(
    (secret): secret is string => secret !== undefined && secret !== "",
  )
  const cause = causeRead(input.cause, input.status, input.statusText, secrets)
  const diagnostics = {
    operation: input.operation,
    kind: input.kind,
    cause,
    context: {
      method: input.method,
      phase: input.phase,
      ...(input.target === undefined ? {} : { target: targetRead(input.target, secrets) }),
      ...(input.statusText === undefined ? {} : { statusText: stringRead(input.statusText, 160, secrets) }),
    },
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.responseDetail === undefined
      ? {}
      : { responseDetail: responseDetailRead(input.responseDetail, secrets) }),
  }

  return resultErrorCreate(
    input.operation,
    stringRead(input.message, maxStringLength, secrets),
    input.rawData === undefined
      ? undefined
      : valueSanitize(input.rawData, 0, { nodes: 0, seen: new WeakSet<object>(), secrets }),
    { diagnostics },
  )
}

const causeRead = (
  cause: unknown,
  status: number | undefined,
  statusText: string | undefined,
  secrets: readonly string[],
): string => {
  if (cause instanceof Error) return stringRead(cause.message || cause.name, maxCauseLength, secrets)
  if (typeof cause === "string") return stringRead(cause, maxCauseLength, secrets)
  if (cause !== undefined) return stringRead(String(cause), maxCauseLength, secrets)
  if (status !== undefined) return stringRead(statusText || `HTTP ${status}`, maxCauseLength, secrets)
  return "Unknown client error"
}

const responseDetailRead = (detail: unknown, secrets: readonly string[]): string => {
  const sanitized = valueSanitize(detail, 0, { nodes: 0, seen: new WeakSet<object>(), secrets })
  if (typeof sanitized === "string") return stringRead(sanitized, maxResponseDetailLength, secrets)
  try {
    return stringRead(JSON.stringify(sanitized), maxResponseDetailLength, secrets)
  } catch {
    return unsupportedValue
  }
}

const targetRead = (target: string | URL, secrets: readonly string[]): string => {
  const value = String(target)
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    if (url.origin === "null") return `${url.protocol}${url.pathname}`
    return `${url.origin}${url.pathname}`
  } catch {
    const queryStart = value.search(/[?#]/u)
    return stringRead(queryStart < 0 ? value : value.slice(0, queryStart), maxStringLength, secrets)
  }
}

const stringRead = (value: string, maxLength: number, secrets: readonly string[] = []): string => {
  const withoutUrls = value.replace(urlPattern, (url) => targetRead(url, secrets))
  const withoutBearer = withoutUrls.replace(bearerPattern, `Bearer ${redactedValue}`)
  const withoutAssignments = withoutBearer.replace(
    secretAssignmentPattern,
    (_match, prefix: string) => `${prefix}${redactedValue}`,
  )
  const withoutQuotedAssignments = withoutAssignments.replace(
    quotedSecretAssignmentPattern,
    (_match, quote: string, key: string, separator: string) => `${quote}${key}${quote}${separator}"${redactedValue}"`,
  )
  const withoutSecrets = secrets.reduce(
    (current, secret) => current.replaceAll(secret, redactedValue),
    withoutQuotedAssignments,
  )
  return withoutSecrets.replace(/\p{Cc}/gu, " ").slice(0, maxLength)
}

const valueSanitize = (value: unknown, depth: number, state: SanitizeState): unknown => {
  state.nodes += 1
  if (state.nodes > maxStructuredNodes) return truncatedValue
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return typeof value === "number" && !Number.isFinite(value) ? unsupportedValue : value
  if (typeof value === "string") return stringRead(value, maxStringLength, state.secrets)
  if (typeof value !== "object") return unsupportedValue
  if (depth >= maxStructuredDepth) return truncatedValue
  if (state.seen.has(value)) return "[CIRCULAR]"
  state.seen.add(value)

  try {
    if (Array.isArray(value)) return arraySanitize(value, depth, state)
    return objectSanitize(value, depth, state)
  } catch {
    return unsupportedValue
  } finally {
    state.seen.delete(value)
  }
}

const arraySanitize = (value: readonly unknown[], depth: number, state: SanitizeState): unknown[] => {
  const output: unknown[] = []
  const length = Math.min(value.length, maxStructuredEntries)
  for (let index = 0; index < length; index += 1) output.push(valueSanitize(value[index], depth + 1, state))
  if (value.length > length) output.push(truncatedValue)
  return output
}

const objectSanitize = (value: object, depth: number, state: SanitizeState): Record<string, unknown> => {
  const output: Record<string, unknown> = {}
  const keys = Object.keys(value)
  const length = Math.min(keys.length, maxStructuredEntries)
  for (let index = 0; index < length; index += 1) {
    const key = keys[index]
    if (key === undefined) continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    const child =
      descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined
        ? unsupportedValue
        : sensitiveKeyPattern.test(key)
          ? redactedValue
          : valueSanitize(descriptor.value, depth + 1, state)
    output[key.slice(0, maxStringLength)] = child
  }
  if (keys.length > length) output["..."] = truncatedValue
  return output
}
