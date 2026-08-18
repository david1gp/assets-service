import { documentExtensionMediaTypes } from "../document/documentExtensionMediaTypes.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadMediaTypeCheck } from "../upload/uploadMediaTypeCheck.js"
import type { UploadSupportedMediaType } from "../upload/uploadSupportedMediaTypes.js"

const mediaTypesByClass: Readonly<Record<Exclude<AssetClass, "document">, Readonly<Record<string, string>>>> = {
  image: {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  },
  video: {
    mp4: "video/mp4",
    webm: "video/webm",
  },
  font: {
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  },
}

const extensionRead = (filename: string): string => {
  const separator = filename.lastIndexOf(".")
  return separator < 0 ? "" : filename.slice(separator + 1).toLowerCase()
}

export const assetSourceMediaTypeRead = (
  assetClass: AssetClass,
  filename: string,
): Result<UploadSupportedMediaType> => {
  const op = "assetSourceMediaTypeRead"
  const extension = extensionRead(filename)
  const mediaType =
    assetClass === "document" ? documentExtensionMediaTypes[extension] : mediaTypesByClass[assetClass][extension]
  if (mediaType === undefined)
    return resultErrorCreate(op, `The ${assetClass} file extension is not supported: ${filename}`)
  const checked = uploadMediaTypeCheck(mediaType)
  if (!checked.success) return checked
  return checked
}
