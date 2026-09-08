import type { UiAssetPreviewSource } from "../pages/uiAssetPreviewSourceRead.js"
import { uiAssetPreviewImageStateCreate } from "./uiAssetPreviewImageStateCreate.js"

export type UiAssetPreviewImageProps = {
  source: () => UiAssetPreviewSource
  class?: string
}

/**
 * Asset preview image. Uses a plain `img` instead of `Img` because only the
 * native error event can trigger the original-image fallback.
 */
export function UiAssetPreviewImage(p: UiAssetPreviewImageProps) {
  const state = uiAssetPreviewImageStateCreate(() => p.source())
  return (
    <img
      src={state.src()}
      alt={state.alt()}
      class={p.class}
      loading="lazy"
      decoding="async"
      draggable={false}
      width={state.width()}
      height={state.height()}
      onError={state.loadFailed}
    />
  )
}
