import { documentExtensionMediaTypes } from "../document/documentExtensionMediaTypes.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"

export const assetClassFromMediaType = (mediaType: string): AssetClass | undefined => {
  if (mediaType.startsWith("image/")) return "image"
  if (mediaType.startsWith("video/")) return "video"
  if (mediaType.startsWith("font/")) return "font"
  if (Object.values(documentExtensionMediaTypes).includes(mediaType as (typeof documentExtensionMediaTypes)[string]))
    return "document"
  return undefined
}
