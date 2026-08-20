import type { DesktopTableClassNames } from "#ui/table/shared/DesktopTableClassNames.js"

/** Default styling for desktop Table1D tables with proper cell padding, borders, and header backgrounds. */
export function uiTableDesktopClassesRead(overrides?: DesktopTableClassNames): DesktopTableClassNames {
  return {
    class: "w-full text-left text-sm",
    header:
      "border-b border-gray-200 bg-gray-50/80 px-4 py-3 font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200",
    row: "border-b border-gray-100 transition-colors hover:bg-gray-50/60 dark:border-gray-800 dark:hover:bg-gray-800/50 last:border-b-0",
    data: "px-4 py-3.5 align-middle",
    ...overrides,
  }
}
