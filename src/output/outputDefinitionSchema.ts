import * as v from "valibot"

import { documentOutputDefinitionSchema } from "./documentOutputDefinitionSchema.js"
import { fontOutputDefinitionSchema } from "./fontOutputDefinitionSchema.js"
import { imageOutputDefinitionSchema } from "./imageOutputDefinitionSchema.js"
import { videoOutputDefinitionSchema } from "./videoOutputDefinitionSchema.js"

export const outputDefinitionSchema = v.variant("kind", [
  imageOutputDefinitionSchema,
  videoOutputDefinitionSchema,
  fontOutputDefinitionSchema,
  documentOutputDefinitionSchema,
])

export type OutputDefinition = v.InferOutput<typeof outputDefinitionSchema>
