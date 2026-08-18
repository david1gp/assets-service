export const sessionCookieRead = (request: Request, name: string): string | null => {
  const header = request.headers.get("cookie")
  if (!header) return null

  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }

  return null
}
