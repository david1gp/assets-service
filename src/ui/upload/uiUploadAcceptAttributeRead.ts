import { uploadSupportedMediaTypes } from "../../upload/uploadSupportedMediaTypes.js"
import { uiUploadExtensionMediaTypes } from "./uiUploadExtensionMediaTypes.js"

/**
 * Builds the `accept` value of the upload file input from the same allowlist the
 * API enforces, so the picker cannot offer a file the service would reject.
 */
export const uiUploadAcceptAttributeRead = (): string => {
  const extensions = Object.entries(uiUploadExtensionMediaTypes)
    .filter(([, mediaType]) => uploadSupportedMediaTypes.includes(mediaType))
    .map(([extension]) => `.${extension}`)
  return [...uploadSupportedMediaTypes, ...extensions].join(",")
}
