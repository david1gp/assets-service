const redactedValue = "[REDACTED]"

export const cloudflareSecretRedact = (value: string, secrets: readonly (string | undefined)[] = []): string => {
  const withoutAssignments = value.replace(
    /(\b(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|refresh[-_ ]?token|id[-_ ]?token|credential|signature|x-amz-[\w-]+)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu,
    (_match, prefix: string) => `${prefix}${redactedValue}`,
  )
  const withoutBearer = withoutAssignments.replace(/(\bBearer\s+)[^\s,;}]+/giu, `$1${redactedValue}`)
  return secrets
    .filter((secret): secret is string => secret !== undefined && secret.length > 0)
    .reduce((current, secret) => current.replaceAll(secret, redactedValue), withoutBearer)
}
