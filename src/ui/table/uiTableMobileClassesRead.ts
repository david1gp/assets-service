import type { MobileTableClassNames } from "#ui/table/shared/MobileTableClassNames.js"

/** Default styling for mobile Table1M cards with consistent card padding and borders. */
export function uiTableMobileClassesRead(overrides?: MobileTableClassNames): MobileTableClassNames {
  return {
    class: "flex flex-col gap-3 p-4",
    entry: "rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800",
    header: "text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400",
    ...overrides,
  }
}
