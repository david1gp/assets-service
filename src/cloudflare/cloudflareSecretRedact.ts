const redactedValue = "[REDACTED]"
const secretFieldPattern = "access[-_ ]?key[-_ ]?id|secret[-_ ]?access[-_ ]?key|revocation[-_ ]?id|api[-_ ]?token"
const quotedSecretAssignmentPattern = new RegExp(
  `(["'])(${secretFieldPattern})\\1(\\s*:\\s*)(?:"[^"]*"|'[^']*'|[^,}\\s]+)`,
  "giu",
)

export const cloudflareSecretRedact = (value: string, secrets: readonly (string | undefined)[] = []): string => {
  const withoutAssignments = value.replace(
    new RegExp(
      `(\\b(?:${secretFieldPattern}|authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\\w-]+)\\b\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;}]+)`,
      "giu",
    ),
    (_match, prefix: string) => `${prefix}${redactedValue}`,
  )
  const withoutQuotedAssignments = withoutAssignments.replace(
    quotedSecretAssignmentPattern,
    (_match, quote: string, key: string, separator: string) => `${quote}${key}${quote}${separator}"${redactedValue}"`,
  )
  const withoutBearer = withoutQuotedAssignments.replace(/(\bBearer\s+)[^\s,;}]+/giu, `$1${redactedValue}`)
  return secrets
    .filter((secret): secret is string => secret !== undefined && secret.length > 0)
    .reduce((current, secret) => current.replaceAll(secret, redactedValue), withoutBearer)
}
