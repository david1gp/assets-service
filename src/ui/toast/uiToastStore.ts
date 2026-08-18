import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { UiToast } from "./uiToastSchema.js"

/** Queue backing the app-owned toast viewport. */
export const uiToastStore = createSignalObject<readonly UiToast[]>([])
