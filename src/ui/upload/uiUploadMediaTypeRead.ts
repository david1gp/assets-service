import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uploadMediaTypeCheck } from "../../upload/uploadMediaTypeCheck.js"
import type { UploadSupportedMediaType } from "../../upload/uploadSupportedMediaTypes.js"
import { uiUploadExtensionMediaTypes } from "./uiUploadExtensionMediaTypes.js"

/**
 * Resolves the media type of a selected file and checks it against the same
 * allowlist the API enforces, so an unsupported file is refused in the form
 * before an upload intent is requested.
 */
export const uiUploadMediaTypeRead = (file: File): Result<UploadSupportedMediaType> => {
  const declared = file.type.trim()
  if (declared.length > 0) return uploadMediaTypeCheck(declared)
  const segments = file.name.split(".")
  const extension = segments.length > 1 ? (segments.pop()?.toLowerCase() ?? "") : ""
  const guessed = uiUploadExtensionMediaTypes[extension]
  if (guessed !== undefined) return { success: true, data: guessed }
  return resultErrorCreate(
    "uiUploadMediaTypeRead",
    extension.length === 0
      ? "This file has no extension, so its type is unknown. Rename it or pick a supported file."
      : `Files ending in .${extension} are not supported. Pick a JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, or font file.`,
    { filename: file.name },
  )
}
