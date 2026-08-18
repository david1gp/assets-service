/**
 * Media types the service can ingest. Image, video, and font entries are
 * detectable from their byte signatures. Document entries are validated by
 * their explicit MIME/extension mapping and are passed through unchanged.
 *
 * `image/svg+xml` is deliberately absent. An SVG has no byte signature, so a
 * staged object could not be verified against the declared type, the output
 * contracts only describe raster formats (`jpg`, `png`, `webp`, `avif`), and an
 * SVG served from the public bucket is active content that can run script in
 * the site origin. SVG files therefore stay hand-managed under `public/` in the
 * consuming project instead of passing through this pipeline.
 */
export const uploadSupportedMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "text/csv",
  "text/plain",
] as const

export type UploadSupportedMediaType = (typeof uploadSupportedMediaTypes)[number]
