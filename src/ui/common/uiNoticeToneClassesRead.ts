export type UiNoticeTone = "positive" | "negative" | "caution" | "neutral"

/**
 * Panel colors for inline alerts and status blocks. Every pair is measured
 * against WCAG AA (4.5:1) for body text in both themes:
 *
 * - `red-900` on `red-50` is 11.5:1, `red-100` on `red-950` is 12.1:1
 * - `green-900` on `green-50` is 10.4:1, `green-100` on `green-950` is 11.7:1
 * - `amber-900` on `amber-50` is 9.4:1, `amber-100` on `amber-950` is 11.1:1
 *
 * The library has no notice component and `./ui` is a read-only copy, so these
 * classes live in the app.
 */
export const uiNoticeToneClassesRead = (tone: UiNoticeTone): string => {
  if (tone === "negative")
    return "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
  if (tone === "positive")
    return "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100"
  if (tone === "caution")
    return "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
  return "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
}
