import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AuthenticatedPrincipal } from "../../authentication/authenticatedPrincipalSchema.js"

export type UiSession = {
  status: "unknown" | "loading" | "authenticated" | "anonymous" | "error"
  principal: AuthenticatedPrincipal | null
  errorMessage: string | null
}

/** Application-wide authentication state shared by the shell and routes. */
export const uiSessionStore = createSignalObject<UiSession>({
  status: "unknown",
  principal: null,
  errorMessage: null,
})
