/**
 * Class overrides for the library red button variants. `filledRed` paints white
 * on `red-500` (3.9:1) and `outlineRed` paints `red-500` text on the page
 * background (also 3.9:1), both under the WCAG AA 4.5:1 floor for body text.
 * `./ui` is a read-only copy, so the app passes these through the `class` prop,
 * where tailwind-merge lets them replace the variant colors.
 *
 * `red-700` on white is 5.9:1 and `red-300` on `slate-900` is 8.1:1.
 */
export const uiDestructiveButtonClassesRead = (style: "filled" | "outline"): string => {
  if (style === "filled") return "bg-red-700 hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700 focus:ring-red-700"
  return "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950 border-red-400 dark:border-red-700 focus:ring-red-700"
}
