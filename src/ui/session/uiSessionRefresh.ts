import * as v from "valibot"
import { authenticatedPrincipalSchema } from "../../authentication/authenticatedPrincipalSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInAttemptsReset } from "./uiSessionAutoSignInAttemptsReset.js"
import { uiSessionStore } from "./uiSessionStore.js"

/** Reloads the current session from the service and updates the session store. */
export const uiSessionRefresh = async (): Promise<void> => {
  const client = uiApiClientRead()
  if (!client.success) {
    uiSessionStore.set({ status: "error", principal: null, errorMessage: client.errorMessage })
    return
  }

  uiSessionStore.set({ ...uiSessionStore.get(), status: "loading", errorMessage: null })
  const session = await client.data.authSessionRead()
  if (!session.success) {
    uiSessionStore.set({ status: "error", principal: null, errorMessage: session.errorMessage })
    return
  }
  if (!session.data.authenticated) {
    uiSessionStore.set({ status: "anonymous", principal: null, errorMessage: null })
    return
  }

  const principal = v.safeParse(authenticatedPrincipalSchema, session.data.principal)
  if (!principal.success) {
    uiSessionStore.set({
      status: "error",
      principal: null,
      errorMessage: ttc("The session principal was invalid", "Die Sitzungsidentität war ungültig"),
    })
    return
  }
  uiSessionStore.set({ status: "authenticated", principal: principal.output, errorMessage: null })
  uiSessionAutoSignInAttemptsReset()
}
