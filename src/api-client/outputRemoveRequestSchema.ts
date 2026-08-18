import * as v from "valibot"

import { outputKeySchema } from "../output/outputKeySchema.js"

export const outputRemoveRequestSchema = v.strictObject({
  key: outputKeySchema,
})

export type OutputRemoveRequest = v.InferOutput<typeof outputRemoveRequestSchema>
