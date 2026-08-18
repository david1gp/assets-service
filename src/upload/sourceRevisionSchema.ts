import * as v from "valibot"

import { assetClassSchema } from "../schemas/assetClassSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { documentExtensionMediaTypes } from "../document/documentExtensionMediaTypes.js"

export const sourceRevisionSchema = v.pipe(
  v.strictObject({
    id: idSchema,
    assetId: idSchema,
    revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    class: assetClassSchema,
    originalFilename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
    mediaType: mediaTypeSchema,
    byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
    sha256: sha256Schema,
    objectKey: v.pipe(v.string(), v.minLength(1)),
    createdAt: isoDateSchema,
  }),
  v.check(
    (source) =>
      source.class !== "document" ||
      documentExtensionMediaTypes[extensionRead(source.originalFilename)] === source.mediaType,
    "Document media type must match its filename extension",
  ),
)

export type SourceRevision = v.InferOutput<typeof sourceRevisionSchema>

function extensionRead(filename: string): string {
  const lastDot = filename.lastIndexOf(".")
  return lastDot < 0 ? "" : filename.slice(lastDot + 1).toLowerCase()
}
