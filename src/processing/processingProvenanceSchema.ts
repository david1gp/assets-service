import * as v from "valibot"

import { processingToolchainSchema } from "./processingToolchainSchema.js"

export const processingProvenanceSchema = v.strictObject({
  schemaVersion: v.literal("assets-service.processing.v1"),
  toolchain: v.pipe(v.array(processingToolchainSchema), v.minLength(1)),
})

export type ProcessingProvenance = v.InferOutput<typeof processingProvenanceSchema>
