export type UiStatusTone = "positive" | "negative" | "neutral"

/**
 * Badge colors that clear WCAG AA (4.5:1) in both themes. The library
 * `filledGreen` variant pairs white on `green-500` at about 2.3:1, which fails,
 * and `./ui` is a read-only copy, so the app defines its own tones.
 */
export const uiStatusToneClassesRead = (tone: UiStatusTone): string => {
  if (tone === "positive") return "bg-green-800 text-white border-green-800 dark:bg-green-300 dark:text-green-950"
  if (tone === "negative") return "bg-red-800 text-white border-red-800 dark:bg-red-300 dark:text-red-950"
  return "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
}
