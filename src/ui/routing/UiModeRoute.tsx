import { Navigate } from "@solidjs/router"
import { type JSX, Show } from "solid-js"
import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiModeRouteStateCreate } from "./uiModeRouteStateCreate.js"

type UiModeRouteProps = { mode: AuthenticationMode; children: JSX.Element }

/** Protects a mode-specific route using the validated session principal. */
export function UiModeRoute(p: UiModeRouteProps) {
  const state = uiModeRouteStateCreate(p.mode)

  return (
    <Show when={!state.isDenied()} fallback={<Navigate href={state.redirectPath()} />}>
      {p.children}
    </Show>
  )
}
