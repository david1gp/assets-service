import * as v from "valibot"

import { assetBasenameSchema } from "../asset/assetBasenameSchema.js"
import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { imageMetadataSchema } from "../metadata/imageMetadataSchema.js"
import { mediaMetadataSchema } from "../metadata/mediaMetadataSchema.js"
import { videoMetadataSchema } from "../metadata/videoMetadataSchema.js"
import { fontMetadataSchema } from "../metadata/fontMetadataSchema.js"
import { outputFormatSchema } from "../output/outputFormatSchema.js"
import { outputKeySchema } from "../output/outputKeySchema.js"
import { fontOutputFormatSchema } from "../processing/fontOutputFormatSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { mediaTypeSchema } from "../schemas/mediaTypeSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

const localImageOutputSchema = v.strictObject({
  kind: v.literal("image"),
  key: outputKeySchema,
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  format: outputFormatSchema,
  quality: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  showAiLabel: v.optional(v.boolean()),
  path: v.pipe(v.string(), v.minLength(1)),
  sha256: sha256Schema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: mediaTypeSchema,
  metadata: imageMetadataSchema,
})

const localVideoOutputSchema = v.strictObject({
  kind: v.literal("video"),
  key: outputKeySchema,
  path: v.pipe(v.string(), v.minLength(1)),
  sha256: sha256Schema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: mediaTypeSchema,
  metadata: videoMetadataSchema,
})

const localFontOutputSchema = v.strictObject({
  kind: v.literal("font"),
  key: outputKeySchema,
  format: fontOutputFormatSchema,
  path: v.pipe(v.string(), v.minLength(1)),
  sha256: sha256Schema,
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  mediaType: mediaTypeSchema,
  metadata: fontMetadataSchema,
})

const localOutputSchema = v.variant("kind", [localImageOutputSchema, localVideoOutputSchema, localFontOutputSchema])

const localAssetSchema = v.strictObject({
  id: idSchema,
  class: v.picklist(["image", "video", "font"]),
  folders: foldersSchema,
  filename: assetFilenameSchema,
  basename: assetBasenameSchema,
  sourcePath: v.pipe(v.string(), v.minLength(1)),
  sourceSha256: sha256Schema,
  sourceByteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sourceMediaType: mediaTypeSchema,
  metadata: mediaMetadataSchema,
  integrationNote: v.optional(v.string()),
  publishedAt: v.optional(isoDateSchema),
  outputs: v.array(localOutputSchema),
  unreferencedPaths: v.array(v.pipe(v.string(), v.minLength(1))),
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
})

export const localAssetStateSchema = v.strictObject({
  schema: v.literal("assets.local-state.v1"),
  root: v.pipe(v.string(), v.minLength(1)),
  outputDir: v.pipe(v.string(), v.minLength(1)),
  assets: v.array(localAssetSchema),
})

export type LocalAssetState = v.InferOutput<typeof localAssetStateSchema>
