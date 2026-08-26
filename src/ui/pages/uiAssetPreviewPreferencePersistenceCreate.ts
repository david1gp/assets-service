import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../storage/uiLocalStorageWrite.js"

const uiAssetPreviewPreferenceKey = "assets-service:ui:asset-list:show-previews"
const uiAssetPreviewPreferenceSchema = v.boolean()

type UiAssetPreviewPreferencePersistenceOptions = {
  debounceMilliseconds?: number
  storage?: Storage
}

/** Creates validated browser persistence for the asset-list image-preview preference. */
export const uiAssetPreviewPreferencePersistenceCreate = (options?: UiAssetPreviewPreferencePersistenceOptions) => {
  const hydrate = () =>
    uiLocalStorageRead(uiAssetPreviewPreferenceKey, uiAssetPreviewPreferenceSchema, options?.storage)

  const persist = (showPreviews: boolean): Promise<Result<true>> => {
    const op = "uiAssetPreviewPreferencePersistenceCreate"
    const parsed = v.safeParse(uiAssetPreviewPreferenceSchema, showPreviews)
    if (!parsed.success) return Promise.resolve(resultErrorCreate(op, v.summarize(parsed.issues), showPreviews))
    return uiLocalStorageWrite(uiAssetPreviewPreferenceKey, parsed.output, options)
  }

  return { hydrate, persist }
}
