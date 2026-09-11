import type { PageInfo } from "../../api-client/pageInfoSchema.js"
import { ttc } from "../localization/ttc.js"

export type UiPageSummaryInput = {
  /** Number of items rendered on the current page. */
  shownCount: number
  /** Page metadata of the current response, when it has been loaded. */
  page: PageInfo | undefined
  /** Numeric offset cursor of the current page; undefined on the first page. */
  cursor: number | undefined
}

/** Builds the "Showing 100 of 1,234 assets · Page 2/13" pagination summary. */
export const uiPageSummaryTextRead = (input: UiPageSummaryInput): string => {
  const shown = input.shownCount
  const total = input.page?.total
  const noun = (count: number) => (count === 1 ? ttc("asset", "Medium") : ttc("assets", "Medien"))
  if (total === undefined || total === 0)
    return shown === 0
      ? `${ttc("Showing", "Angezeigt")} 0 ${ttc("assets", "Medien")}`
      : `${ttc("Showing", "Angezeigt")} ${shown.toLocaleString("en-US")} ${noun(shown)}`

  const limit = input.page?.limit ?? shown
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1
  const currentPage = limit > 0 ? Math.min(totalPages, Math.floor((input.cursor ?? 0) / limit) + 1) : 1
  const counts = `${ttc("Showing", "Angezeigt")} ${shown.toLocaleString("en-US")} ${ttc("of", "von")} ${total.toLocaleString("en-US")} ${noun(total)}`
  return `${counts} · ${ttc("Page", "Seite")} ${currentPage}/${totalPages}`
}
