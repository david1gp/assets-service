import { Navigate } from "@solidjs/router"
import { type JSX, Show } from "solid-js"
import type { AuthenticationMode } from "../../authentication/authenticationModeSchema.js"
import { uiModeRouteStateCreate } from "./uiModeRouteStateCreate.js"
import { uiProjectRouteContext as UiProjectRouteContext } from "./uiProjectRouteContext.js"
import { uiProjectRouteStateCreate } from "./uiProjectRouteStateCreate.js"

type UiModeRouteProps = { mode: AuthenticationMode; children: JSX.Element }

/** Protects a mode-specific route using the validated session principal. */
export function UiModeRoute(p: UiModeRouteProps) {
  const state = uiModeRouteStateCreate(p.mode)
  const route = uiProjectRouteStateCreate()

  return (
    <Show when={!state.isDenied()} fallback={<Navigate href={state.redirectPath()} />}>
      <Show when={route.projectQuery.data()} fallback={null}>
        {(project) => (
          <UiProjectRouteContext.Provider
            value={{
              project,
              projectId: route.projectId,
              organizationSlug: route.organizationSlug,
              projectSlug: route.projectSlug,
            }}
          >
            {p.children}
          </UiProjectRouteContext.Provider>
        )}
      </Show>
    </Show>
  )
}
