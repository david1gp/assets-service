import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { SetPageTitle } from "#ui/static/meta/SetPageTitle.jsx"
import { mdiLogin, mdiRefresh } from "@mdi/js"
import { Show } from "solid-js"
import { uiLoginPageStateCreate } from "./uiLoginPageStateCreate.js"
import { UiNotice } from "../common/UiNotice.jsx"

/** Sign-in page for the hosted identity provider flow. */
export function UiLoginPage() {
  const state = uiLoginPageStateCreate()

  return (
    <>
      <SetPageTitle title="Sign in · Assets service" />
      <CardWrapper class="mx-auto mt-10 max-w-md p-6">
        <h1 class="text-2xl font-semibold">Sign in</h1>
        <p class="mt-2 text-muted-foreground">
          The assets admin needs an authenticated session before projects can be listed.
        </p>
        <Show when={state.errorMessage()}>
          {(message) => (
            <UiNotice tone="negative" role="alert" class="mt-4">
              {message()}
            </UiNotice>
          )}
        </Show>
        <div class="mt-6 flex flex-wrap gap-3">
          <ButtonIcon icon={mdiLogin} isLoading={state.isPending()} onClick={() => void state.login()}>
            Sign in
          </ButtonIcon>
          <ButtonIcon icon={mdiRefresh} variant="outline" onClick={state.retrySession}>
            Check session
          </ButtonIcon>
        </div>
      </CardWrapper>
    </>
  )
}
