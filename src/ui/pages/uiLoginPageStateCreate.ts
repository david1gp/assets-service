import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useLocation } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import { ttc } from "../localization/ttc.js"
import { uiSessionAutoSignInAttemptRecord } from "../session/uiSessionAutoSignInAttemptRecord.js"
import { uiSessionAutoSignInPreferenceRead } from "../session/uiSessionAutoSignInPreferenceRead.js"
import { uiSessionAutoSignInPreferenceWrite } from "../session/uiSessionAutoSignInPreferenceWrite.js"
import { uiSessionLogin } from "../session/uiSessionLogin.js"
import { uiSessionRefresh } from "../session/uiSessionRefresh.js"
import { uiSessionStore } from "../session/uiSessionStore.js"

/** Holds sign-in button, automatic sign-in preference, and error state for the login page. */
export const uiLoginPageStateCreate = () => {
  const location = useLocation()
  const pending = createSignalObject(false)
  const errorMessage = createSignalObject<string | null>(null)
  const autoSignIn = createSignalObject(uiSessionAutoSignInPreferenceRead())

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

  let autoSignInInitiated = false
  createEffect(() => {
    const current = session()
    if (autoSignInInitiated) return
    if (current.status !== "anonymous") return
    if (!autoSignIn.get()) return

    const record = uiSessionAutoSignInAttemptRecord()
    if (!record.success) {
      errorMessage.set(record.errorMessage)
      return
    }
    if (!record.data.allowed) {
      errorMessage.set(
        ttc(
          "Automatic sign-in was paused after multiple attempts. Please sign in manually.",
          "Die automatische Anmeldung wurde nach mehreren Versuchen pausiert. Bitte melden Sie sich manuell an.",
        ),
      )
      return
    }

    autoSignInInitiated = true
    void login()
  })

  const autoSignInToggle = (enabled: boolean) => {
    const preferenceWrite = uiSessionAutoSignInPreferenceWrite(enabled)
    if (!preferenceWrite.success) {
      errorMessage.set(preferenceWrite.errorMessage)
      return
    }

    autoSignIn.set(enabled)
    if (!enabled) return

    autoSignInInitiated = true
    const record = uiSessionAutoSignInAttemptRecord()
    if (!record.success) {
      errorMessage.set(record.errorMessage)
      return
    }
    if (!record.data.allowed) {
      errorMessage.set(
        ttc(
          "Automatic sign-in was paused after multiple attempts. Please sign in manually.",
          "Die automatische Anmeldung wurde nach mehreren Versuchen pausiert. Bitte melden Sie sich manuell an.",
        ),
      )
      return
    }

    void login()
  }

  return {
    session,
    isPending: pending.get,
    errorMessage: () => errorMessage.get() ?? session().errorMessage,
    autoSignIn: autoSignIn.get,
    autoSignInToggle,
    login,
    loginClick: () => void login(),
    retrySession: () => void uiSessionRefresh(),
  }
}
