/**
 * Media types the service can ingest. Every entry is detectable from its own
 * byte signature in `storageMediaTypeDetect` and processable by the image,
 * video, or font adapters.
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
] as const

export type UploadSupportedMediaType = (typeof uploadSupportedMediaTypes)[number]
