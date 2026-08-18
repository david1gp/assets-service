import type { Result } from "../schemas/resultSchema.js"
import type { FontProcessingOutput } from "./fontProcessingOutput.js"
import type { FontProcessingRequest } from "./fontProcessingRequestSchema.js"

export type FontProcessingAdapter = (input: FontProcessingRequest) => Result<FontProcessingOutput>
