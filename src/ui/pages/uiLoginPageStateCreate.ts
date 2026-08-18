import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useLocation } from "@solidjs/router"
import { createMemo } from "solid-js"
import { uiSessionLogin } from "../session/uiSessionLogin.js"
import { uiSessionRefresh } from "../session/uiSessionRefresh.js"
import { uiSessionStore } from "../session/uiSessionStore.js"

/** Holds sign-in button and error state for the login page. */
export const uiLoginPageStateCreate = () => {
  const location = useLocation()
  const pending = createSignalObject(false)
  const errorMessage = createSignalObject<string | null>(null)

  const session = createMemo(() => uiSessionStore.get())

  const login = async () => {
    pending.set(true)
    errorMessage.set(null)
    const result = await uiSessionLogin(`${location.pathname}${location.search}`)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      pending.set(false)
    }
  }

  return {
    session,
    isPending: pending.get,
    errorMessage: () => errorMessage.get() ?? session().errorMessage,
    login,
    retrySession: () => void uiSessionRefresh(),
  }
}
