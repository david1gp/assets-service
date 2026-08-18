import type { UiToastTone } from "./uiToastSchema.js"

/**
 * Toast surface colors that clear WCAG AA (4.5:1) in both themes.
 * `green-100` on `green-900` is 12.6:1 and `red-100` on `red-900` is 11.9:1.
 * The library variants pair white on `green-500` (2.3:1) and `red-600` (4.2:1).
 */
export const uiToastToneClassesRead = (tone: UiToastTone): string =>
  tone === "positive" ? "border-green-700 bg-green-900 text-green-100" : "border-red-700 bg-red-900 text-red-100"
