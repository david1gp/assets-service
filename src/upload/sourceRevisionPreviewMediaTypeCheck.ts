const previewMediaTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"])

export const sourceRevisionPreviewMediaTypeCheck = (mediaType: string): boolean =>
  previewMediaTypes.has(mediaType.toLowerCase())
