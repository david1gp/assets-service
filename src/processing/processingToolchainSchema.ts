import * as v from "valibot"

export const processingToolchainSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1)),
  version: v.pipe(v.string(), v.minLength(1)),
})

export type ProcessingToolchain = v.InferOutput<typeof processingToolchainSchema>
