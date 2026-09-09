import { uiApiClientRead } from "../client/uiApiClientRead.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiSessionAutoSignInAttemptsExhaust } from "./uiSessionAutoSignInAttemptsExhaust.js"
import { uiSessionStore } from "./uiSessionStore.js"

/** Revokes the current session, pauses automatic sign-in loops, and resets the session store. */
export const uiSessionLogout = async (): Promise<Result<true>> => {
  const client = uiApiClientRead()
  if (!client.success) return client
  const logout = await client.data.authLogout()
  if (!logout.success) return logout
  uiSessionAutoSignInAttemptsExhaust()
  uiSessionStore.set({ status: "anonymous", principal: null, errorMessage: null })
  return { success: true, data: true }
}
