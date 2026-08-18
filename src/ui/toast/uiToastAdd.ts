import type { UiToast, UiToastTone } from "./uiToastSchema.js"
import { uiToastDismiss } from "./uiToastDismiss.js"
import { uiToastLimit } from "./uiToastLimit.js"
import { uiToastStore } from "./uiToastStore.js"

const dismissDelayMilliseconds = { positive: 5000, negative: 10_000 } as const

/**
 * Queues a toast in the app-owned viewport.
 *
 * The library `Toaster` puts `role="status"` on every `<li>`, which removes the
 * `listitem` role and makes axe fail the `<ul>` with "List element has direct
 * children whose role is not listitem". `./ui` is read-only, so the app renders
 * its own viewport instead. Failures stay visible twice as long as successes.
 */
export const uiToastAdd = (input: { tone: UiToastTone; title: string; description?: string }): string => {
  const toast: UiToast = {
    id: `toast-${crypto.randomUUID()}`,
    tone: input.tone,
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
  }
  uiToastStore.set([...uiToastStore.get(), toast].slice(-uiToastLimit))
  setTimeout(() => uiToastDismiss(toast.id), dismissDelayMilliseconds[input.tone])
  return toast.id
}
