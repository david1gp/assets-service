import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadSupportedMediaTypes } from "./uploadSupportedMediaTypes.js"
import type { UploadSupportedMediaType } from "./uploadSupportedMediaTypes.js"

const supported = new Set<string>(uploadSupportedMediaTypes)

/**
 * Rejects a media type the pipeline cannot verify or process, before an upload
 * intent is issued. The message names the type and lists the accepted ones, so
 * the API answers 400 with actionable text instead of failing at completion.
 */
export const uploadMediaTypeCheck = (mediaType: string): Result<UploadSupportedMediaType> => {
  const normalized = mediaType.trim().toLowerCase().split(";")[0]?.trim() ?? ""
  if (supported.has(normalized)) return { success: true, data: normalized as UploadSupportedMediaType }
  const label = normalized.length === 0 ? "An empty media type" : `The media type ${normalized}`
  return resultErrorCreate(
    "uploadMediaTypeCheck",
    `${label} is not allowed. Upload one of ${uploadSupportedMediaTypes.join(", ")}.`,
    { mediaType },
  )
}
