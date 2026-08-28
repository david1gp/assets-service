import { createMemo } from "solid-js"
import * as v from "valibot"
import { structureResponseSchema } from "../../api-client/structureResponseSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiStructureFolderPathsRead } from "./uiStructureFolderPathsRead.js"

type UiStructureFolderPathsInput = {
  projectId: () => string
  /** Folder paths are only fetched while the folder UI is visible. */
  isEnabled: () => boolean
}

/**
 * Loads every structure folder of a project as a flat list of `parent/child`
 * paths, usable as folder filter options in both the list and structure view.
 */
export const uiStructureFolderPathsStateCreate = (input: UiStructureFolderPathsInput) => {
  const query = uiQueryCreate<v.InferOutput<typeof structureResponseSchema> | null>(
    async () => {
      if (!input.isEnabled()) return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiStructureFolderPathsRead", client.errorMessage)
      return client.data.structureRead(input.projectId())
    },
    {
      cacheKey: () =>
        input.isEnabled() ? uiQueryCacheKeyCreate("asset-structure-folders", input.projectId()) : undefined,
      cacheSchema: v.nullable(structureResponseSchema),
    },
  )

  const paths = createMemo(() => uiStructureFolderPathsRead(query.data()?.folders ?? []))

  return { query, paths }
}
