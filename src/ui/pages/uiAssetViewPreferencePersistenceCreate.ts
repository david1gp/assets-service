import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../storage/uiLocalStorageWrite.js"
import { uiAssetViewTabs } from "./uiAssetViewTabs.js"

const uiAssetViewPreferenceKey = "assets-service:ui:asset-list:view"
const uiAssetViewPreferenceSchema = v.picklist(uiAssetViewTabs)
type UiAssetViewPreference = v.InferOutput<typeof uiAssetViewPreferenceSchema>

type UiAssetViewPreferencePersistenceOptions = {
  debounceMilliseconds?: number
  storage?: Storage
}

/** Creates validated browser persistence for the asset-list view-mode preference. */
export const uiAssetViewPreferencePersistenceCreate = (options?: UiAssetViewPreferencePersistenceOptions) => {
  const hydrate = () => uiLocalStorageRead(uiAssetViewPreferenceKey, uiAssetViewPreferenceSchema, options?.storage)

  const persist = (view: UiAssetViewPreference): Promise<Result<true>> => {
    const op = "uiAssetViewPreferencePersistenceCreate"
    const parsed = v.safeParse(uiAssetViewPreferenceSchema, view)
    if (!parsed.success) return Promise.resolve(resultErrorCreate(op, v.summarize(parsed.issues), view))
    return uiLocalStorageWrite(uiAssetViewPreferenceKey, parsed.output, options)
  }

  return { hydrate, persist }
}
