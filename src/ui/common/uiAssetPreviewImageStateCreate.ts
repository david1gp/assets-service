import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { UiAssetPreviewSource } from "../pages/uiAssetPreviewSourceRead.js"

/**
 * Swaps a broken optimized preview for the latest original image exactly once.
 * The failed URL is remembered instead of a boolean flag, so a new asset or a
 * new preview source resets the fallback without an extra effect.
 */
export const uiAssetPreviewImageStateCreate = (source: () => UiAssetPreviewSource) => {
  const failedUrl = createSignalObject<string | null>(null)
  const isFallbackActive = () => source().fallbackUrl !== null && failedUrl.get() === source().url
  return {
    alt: () => source().alt,
    src: () => (isFallbackActive() ? (source().fallbackUrl ?? source().url) : source().url),
    // The original preview has no known dimensions, so they must not be inherited from the output.
    width: () => {
      const current = source()
      return current.kind === "optimized" && !isFallbackActive() ? current.width : undefined
    },
    height: () => {
      const current = source()
      return current.kind === "optimized" && !isFallbackActive() ? current.height : undefined
    },
    /** Ignores errors of the fallback itself, which would otherwise swap back and loop. */
    loadFailed: () => {
      if (source().fallbackUrl === null || failedUrl.get() === source().url) return
      failedUrl.set(source().url)
    },
  }
}
