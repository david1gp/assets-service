/**
 * Normalizes a deep link into a value the service accepts as `returnTo`:
 * a same-origin absolute path with its query string preserved.
 *
 * Anything the service would reject (protocol-relative, backslash, absolute
 * URL, oversized) falls back to the project list, and `/login` is never a
 * useful destination after signing in.
 */
export const uiSessionReturnToRead = (candidate: string): string => {
  const value = candidate.trim()
  if (!value.startsWith("/")) return "/"
  if (value.startsWith("//")) return "/"
  if (value.includes("\\")) return "/"
  if (value.length > 2048) return "/"
  const [path] = value.split("?")
  if (path === "/login") return "/"
  return value
}
