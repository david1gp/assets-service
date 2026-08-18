import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { fontOutputFormatSchema } from "../processing/fontOutputFormatSchema.js"
import { outputKeySchema } from "./outputKeySchema.js"

export const fontOutputDefinitionSchema = v.strictObject({
  id: idSchema,
  assetId: idSchema,
  kind: v.literal("font"),
  key: outputKeySchema,
  format: fontOutputFormatSchema,
})

export type FontOutputDefinition = v.InferOutput<typeof fontOutputDefinitionSchema>
