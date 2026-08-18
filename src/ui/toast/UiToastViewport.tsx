import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { mdiAlertOctagram, mdiCheckCircle, mdiClose } from "@mdi/js"
import { For, Show } from "solid-js"
import { uiToastDismiss } from "./uiToastDismiss.js"
import { uiToastStore } from "./uiToastStore.js"
import { uiToastToneClassesRead } from "./uiToastToneClassesRead.js"

/**
 * App-owned toast viewport. Mount once near the app root.
 *
 * The live region sits on the wrapping element so every `<li>` keeps its
 * `listitem` role and the list passes the axe `list` rule.
 *
 * `role="log"` carries the implicit `aria-live="polite"` and
 * `aria-relevant="additions"` of an appending region, and it is the role that
 * makes `aria-label` permitted here. A bare labelled `div` fails axe
 * `aria-prohibited-attr`.
 */
export function UiToastViewport() {
  return (
    <div
      role="log"
      aria-label="Notifications"
      class="pointer-events-none fixed inset-x-0 bottom-0 z-100 p-4 print:hidden sm:inset-x-auto sm:right-0"
    >
      <ul class="flex max-h-screen flex-col gap-4">
        <For each={uiToastStore.get()}>
          {(toast) => (
            <li
              class={`pointer-events-auto flex flex-wrap items-start gap-2 rounded-lg border p-4 shadow-lg ${uiToastToneClassesRead(toast.tone)}`}
            >
              <Icon
                path={toast.tone === "positive" ? mdiCheckCircle : mdiAlertOctagram}
                class="size-6 min-h-6 min-w-6 fill-current"
              />
              <div class="min-w-0 flex-1">
                <p class="wrap-anywhere text-lg font-bold">{toast.title}</p>
                <Show when={toast.description}>
                  {(description) => <p class="wrap-anywhere text-lg">{description()}</p>}
                </Show>
              </div>
              <ButtonIcon
                variant="ghost"
                size="sm"
                class="text-current"
                title={`Dismiss ${toast.title}`}
                icon={mdiClose}
                onClick={() => uiToastDismiss(toast.id)}
              />
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
