import * as v from "valibot"

import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiLocalStorageRead } from "../storage/uiLocalStorageRead.js"
import { uiLocalStorageWrite } from "../storage/uiLocalStorageWrite.js"

const uiAssetDisplayPreferenceSchema = v.boolean()

type UiAssetDisplayPreferencePersistenceOptions = {
  debounceMilliseconds?: number
  storage?: Storage
}

/** Creates validated browser persistence for one boolean asset-list display option. */
export const uiAssetDisplayPreferencePersistenceCreate = (
  key: string,
  options?: UiAssetDisplayPreferencePersistenceOptions,
) => {
  const hydrate = () => uiLocalStorageRead(key, uiAssetDisplayPreferenceSchema, options?.storage)

  const persist = (enabled: boolean): Promise<Result<true>> => {
    const op = "uiAssetDisplayPreferencePersistenceCreate"
    const parsed = v.safeParse(uiAssetDisplayPreferenceSchema, enabled)
    if (!parsed.success) return Promise.resolve(resultErrorCreate(op, v.summarize(parsed.issues), enabled))
    return uiLocalStorageWrite(key, parsed.output, options)
  }

  return { hydrate, persist }
}
