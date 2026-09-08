import { Navigate } from "@solidjs/router"
import { Show } from "solid-js"
import { UiNotFoundPage } from "../pages/UiNotFoundPage.jsx"
import { uiLegacyRouteRedirectStateCreate } from "./uiLegacyRouteRedirectStateCreate.js"

/** Replaces a recognized unscoped project route with its safe mode-specific route. */
export function UiLegacyRouteRedirect() {
  const state = uiLegacyRouteRedirectStateCreate()

  return (
    <Show when={state.target()} fallback={<UiNotFoundPage />}>
      {(target) => <Navigate href={target()} />}
    </Show>
  )
}
