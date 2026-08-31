import type { ProjectListItem } from "../../api-client/projectListItemSchema.js"

export type UiProjectListTotals = {
  assetCount: number
  totalFileSize: number
}

/** Sums the asset count and used space of the project items currently shown. */
export const uiProjectListTotalsRead = (projects: readonly ProjectListItem[]): UiProjectListTotals => {
  let assetCount = 0
  let totalFileSize = 0
  for (const project of projects) {
    assetCount += project.assetCount
    totalFileSize += project.totalFileSize
  }
  return { assetCount, totalFileSize }
}
