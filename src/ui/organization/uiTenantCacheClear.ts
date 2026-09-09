import { uiTenantGeneration } from "./uiTenantGeneration.js"

/** Clears cached entity reads and draft state from localStorage to ensure tenant isolation. */
export const uiTenantCacheClear = (storage?: Storage): void => {
  uiTenantGeneration.set(uiTenantGeneration.get() + 1)
  try {
    const target = storage ?? (typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage)
    if (target === undefined) return
    const keysToRemove: string[] = []
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index)
      if (key !== null && (key.startsWith("assets-service:ui-cache") || key.startsWith("assets-service:ui-draft"))) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      target.removeItem(key)
    }
  } catch {
    // Ignore storage clearing failures in restricted environments
  }
}
