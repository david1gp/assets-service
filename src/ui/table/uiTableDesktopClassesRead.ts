import type { DesktopTableClassNames } from "#ui/table/shared/DesktopTableClassNames.js"

/** Default styling for desktop Table1D tables with proper cell padding, borders, and header backgrounds. */
export function uiTableDesktopClassesRead(overrides?: DesktopTableClassNames): DesktopTableClassNames {
  return {
    class: "w-full text-left text-sm",
    header:
      "border-b border-slate-200 bg-slate-50/80 px-4 py-3 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400",
    row: "border-b border-slate-100 transition-colors hover:bg-slate-50/70 dark:border-slate-800/60 dark:hover:bg-slate-800/40 last:border-b-0",
    data: "px-4 py-3.5 align-middle",
    ...overrides,
  }
}
