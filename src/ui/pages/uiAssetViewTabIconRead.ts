import { mdiFileTree } from "@adaptive-ds/mdi/mdiFileTree.js"
import { mdiViewList } from "@adaptive-ds/mdi/mdiViewList.js"
import type { uiAssetViewTabs } from "./uiAssetViewTabs.js"

const icons: Record<(typeof uiAssetViewTabs)[number], string> = {
  list: mdiViewList,
  structure: mdiFileTree,
}

/** MDI path for an asset view tab. */
export function uiAssetViewTabIconRead(tab: (typeof uiAssetViewTabs)[number]): string {
  return icons[tab]
}
