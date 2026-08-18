import * as v from "valibot"

import { outputDefinitionInputSchema } from "./outputDefinitionInputSchema.js"

export const outputAddRequestSchema = outputDefinitionInputSchema

export type OutputAddRequest = v.InferOutput<typeof outputAddRequestSchema>
