import * as v from "valibot"

import { fontMetadataSchema } from "./fontMetadataSchema.js"
import { imageMetadataSchema } from "./imageMetadataSchema.js"
import { videoMetadataSchema } from "./videoMetadataSchema.js"

export const mediaMetadataSchema = v.variant("kind", [imageMetadataSchema, videoMetadataSchema, fontMetadataSchema])

export type MediaMetadata = v.InferOutput<typeof mediaMetadataSchema>
