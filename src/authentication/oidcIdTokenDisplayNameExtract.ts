const maxDisplayNameLength = 256

const claimStringRead = (claims: Record<string, unknown>, key: string): string | undefined => {
  const value = claims[key]
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxDisplayNameLength) return undefined
  return normalized
}

export const oidcIdTokenDisplayNameExtract = (claims: Record<string, unknown>): string | undefined => {
  const name = claimStringRead(claims, "name")
  if (name) return name

  const givenName = claimStringRead(claims, "given_name")
  const familyName = claimStringRead(claims, "family_name")
  const combinedName = [givenName, familyName].filter((value): value is string => value !== undefined).join(" ")
  if (combinedName.length > 0 && combinedName.length <= maxDisplayNameLength) return combinedName

  return (
    claimStringRead(claims, "preferred_username") ??
    claimStringRead(claims, "nickname") ??
    claimStringRead(claims, "email")
  )
}
