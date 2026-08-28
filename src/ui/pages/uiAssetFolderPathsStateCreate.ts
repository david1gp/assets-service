import { createMemo } from "solid-js"
import * as v from "valibot"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiAssetFolderPathsRead } from "./uiAssetFolderPathsRead.js"

type UiAssetFolderPathsInput = {
  projectId: () => string
  /** Canonical folder options are only fetched while the folder UI is visible. */
  isEnabled: () => boolean
}

/** Loads every canonical asset folder as a flat list of `parent/child` paths. */
export const uiAssetFolderPathsStateCreate = (input: UiAssetFolderPathsInput) => {
  const query = uiQueryCreate<string[] | null>(
    async () => {
      if (!input.isEnabled()) return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetFolderPathsRead", client.errorMessage)
      const assets = await client.data.assetsReadAll(input.projectId())
      if (!assets.success) return assets
      return { success: true, data: uiAssetFolderPathsRead(assets.data) }
    },
    {
      cacheKey: () => (input.isEnabled() ? uiQueryCacheKeyCreate("asset-folders", input.projectId()) : undefined),
      cacheSchema: v.nullable(v.array(v.string())),
    },
  )

  const paths = createMemo(() => query.data() ?? [])

  return { query, paths }
}
