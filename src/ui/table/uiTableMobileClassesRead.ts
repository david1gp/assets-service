import type { MobileTableClassNames } from "#ui/table/shared/MobileTableClassNames.js"

/** Default styling for mobile Table1M cards with consistent card padding and borders. */
export function uiTableMobileClassesRead(overrides?: MobileTableClassNames): MobileTableClassNames {
  return {
    class: "flex flex-col gap-3 p-4",
    entry: "rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900",
    header: "text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400",
    ...overrides,
  }
}
