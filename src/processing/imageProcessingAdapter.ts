import type { Result } from "../schemas/resultSchema.js"
import type { ImageProcessingOutput } from "./imageProcessingOutput.js"
import type { ImageProcessingRequest } from "./imageProcessingRequestSchema.js"

export type ImageProcessingAdapter = (input: ImageProcessingRequest) => Promise<Result<ImageProcessingOutput>>
