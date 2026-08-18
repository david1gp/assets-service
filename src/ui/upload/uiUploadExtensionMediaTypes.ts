import type { UploadSupportedMediaType } from "../../upload/uploadSupportedMediaTypes.js"

/**
 * Fallback media types by file extension, for browsers that leave `File.type`
 * empty. Only supported types appear here; SVG is rejected by the service, so
 * mapping it would only move the failure later.
 */
export const uiUploadExtensionMediaTypes: Readonly<Record<string, UploadSupportedMediaType>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
}
