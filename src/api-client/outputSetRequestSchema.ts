import * as v from "valibot"

import { outputDefinitionInputSchema } from "./outputDefinitionInputSchema.js"

/**
 * Full replacement of the output set of one asset. The set keeps at least one
 * output, all of one kind, with unique keys, so an asset can never end up
 * without a renderable variant or with two outputs writing the same object key.
 */
export const outputSetRequestSchema = v.pipe(
  v.strictObject({
    outputs: v.pipe(v.array(outputDefinitionInputSchema), v.minLength(1)),
  }),
  v.check((input) => {
    const keys = input.outputs.map((output) => output.key)
    return new Set(keys).size === keys.length
  }, "Output keys must be unique"),
  v.check(
    (input) => new Set(input.outputs.map((output) => output.kind)).size === 1,
    "Every output must have the same kind",
  ),
)

export type OutputSetRequest = v.InferOutput<typeof outputSetRequestSchema>
