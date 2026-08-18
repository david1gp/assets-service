type SessionCookieOptions = {
  name: string
  maxAgeSeconds: number
  sameSite?: "Lax" | "Strict" | "None"
  path?: string
}

export const sessionCookieCreate = (sessionId: string, options: SessionCookieOptions): string => {
  const sameSite = options.sameSite ?? "Lax"
  const path = options.path ?? "/"
  return [
    `${options.name}=${encodeURIComponent(sessionId)}`,
    `Path=${path}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
    "Secure",
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ].join("; ")
}
