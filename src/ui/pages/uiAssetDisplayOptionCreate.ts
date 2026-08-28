import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { uiAssetDisplayPreferencePersistenceCreate } from "./uiAssetDisplayPreferencePersistenceCreate.js"

/** Creates a boolean display option that hydrates from and persists to browser storage. */
export const uiAssetDisplayOptionCreate = (
  key: string,
  fallback: boolean,
  onChange?: (enabled: boolean) => void,
): SignalObject<boolean> => {
  const state = createSignalObject(fallback)
  const persistence = uiAssetDisplayPreferencePersistenceCreate(key)
  const hydrated = persistence.hydrate()

  if (hydrated.success && hydrated.data !== undefined) state.set(hydrated.data)

  return {
    get: state.get,
    set: (value) => {
      state.set(value)
      void persistence.persist(value)
      onChange?.(value)
    },
  }
}
