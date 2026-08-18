import type { Result } from "../../schemas/resultSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiSessionReturnToRead } from "./uiSessionReturnToRead.js"

/**
 * Starts the hosted login flow. The deep link travels with the authorization
 * request, so the identity provider callback lands back on the page the user
 * asked for, including its query string.
 */
export const uiSessionLogin = async (returnTo: string): Promise<Result<true>> => {
  const client = uiApiClientRead()
  if (!client.success) return client
  const target = uiSessionReturnToRead(returnTo)
  const login = await client.data.authLogin(target)
  if (!login.success) return login
  const url = new URL(login.data.authorizationUrl)
  window.sessionStorage.setItem("assetsReturnTo", target)
  window.location.assign(url.toString())
  return { success: true, data: true }
}
