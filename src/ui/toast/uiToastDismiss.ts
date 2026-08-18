import { uiToastStore } from "./uiToastStore.js"

/** Removes one toast from the queue. Unknown identifiers are ignored. */
export const uiToastDismiss = (id: string): void => {
  uiToastStore.set(uiToastStore.get().filter((toast) => toast.id !== id))
}
