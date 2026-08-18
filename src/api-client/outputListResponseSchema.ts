import * as v from "valibot"

import { outputDefinitionSchema } from "../output/outputDefinitionSchema.js"

export const outputListResponseSchema = v.strictObject({
  outputs: v.array(outputDefinitionSchema),
})

export type OutputListResponse = v.InferOutput<typeof outputListResponseSchema>
