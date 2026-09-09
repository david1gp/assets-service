import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { SetPageTitle } from "#ui/static/meta/SetPageTitle.jsx"
import { mdiLogin } from "@adaptive-ds/mdi/mdiLogin.js"
import { mdiRefresh } from "@adaptive-ds/mdi/mdiRefresh.js"
import { Show } from "solid-js"
import { UiNotice } from "../common/UiNotice.jsx"
import { ttc } from "../localization/ttc.js"
import { uiLoginPageStateCreate } from "./uiLoginPageStateCreate.js"

/** Sign-in page for the hosted identity provider flow. */
export function UiLoginPage() {
  const state = uiLoginPageStateCreate()

  return (
    <>
      <SetPageTitle title={ttc("Sign in · Assets service", "Anmelden · Asset-Service")} />
      <CardWrapper class="mx-auto mt-10 max-w-md p-6">
        <h1 class="text-2xl font-semibold">{ttc("Sign in", "Anmelden")}</h1>
        <p class="mt-2 text-muted-foreground">
          {ttc(
            "Sign in to access your projects and assets.",
            "Melden Sie sich an, um auf Ihre Projekte und Assets zuzugreifen.",
          )}
        </p>
        <Show when={state.errorMessage()}>
          {(message) => (
            <UiNotice tone="negative" role="alert" class="mt-4">
              <p class="font-semibold">
                {ttc("Sign-in could not be completed.", "Die Anmeldung konnte nicht abgeschlossen werden.")}
              </p>
              <p class="mt-1 text-sm">{message()}</p>
            </UiNotice>
          )}
        </Show>
        <div class="mt-6 flex flex-wrap gap-3">
          <ButtonIcon icon={mdiLogin} variant="contrast" isLoading={state.isPending()} onClick={state.loginClick}>
            {ttc("Sign in", "Anmelden")}
          </ButtonIcon>
          <ButtonIcon icon={mdiRefresh} variant="subtle" onClick={state.retrySession}>
            {ttc("Check session", "Sitzung prüfen")}
          </ButtonIcon>
        </div>
        <div class="mt-4">
          <Checkbox id="login-auto-sign-in" checked={state.autoSignIn()} onChange={state.autoSignInToggle}>
            <span class="text-sm font-medium">{ttc("Sign in automatically", "Automatisch anmelden")}</span>
          </Checkbox>
        </div>
      </CardWrapper>
    </>
  )
}
