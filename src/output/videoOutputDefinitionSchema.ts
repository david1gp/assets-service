import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { outputKeySchema } from "./outputKeySchema.js"

export const videoOutputDefinitionSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  kind: v.literal("video"),
  key: outputKeySchema,
})

export type VideoOutputDefinition = v.InferOutput<typeof videoOutputDefinitionSchema>
