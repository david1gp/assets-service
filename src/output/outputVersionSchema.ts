import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { documentExtensionMediaTypes } from "../document/documentExtensionMediaTypes.js"
import { outputExtensionSchema } from "./outputExtensionSchema.js"
import { outputObjectKeySchema } from "./outputObjectKeySchema.js"

export const outputVersionSchema = v.pipe(
  v.strictObject({
    id: idSchema,
    outputDefinitionId: idSchema,
    assetId: idSchema,
    sourceRevisionId: v.nullable(idSchema),
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
    sha256: sha256Schema,
    mediaType: mediaTypeSchema,
    extension: outputExtensionSchema,
    objectKey: outputObjectKeySchema,
    toolchainVersion: v.pipe(v.string(), v.minLength(1)),
    width: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    current: v.boolean(),
    createdAt: isoDateSchema,
  }),
  v.check(
    (version) =>
      !Object.values(documentExtensionMediaTypes).includes(
        version.mediaType as (typeof documentExtensionMediaTypes)[string],
      ) || documentExtensionMediaTypes[version.extension] === version.mediaType,
    "Document output media type must match its extension",
  ),
)

export type OutputVersion = v.InferOutput<typeof outputVersionSchema>
