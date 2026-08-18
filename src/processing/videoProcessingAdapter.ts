import type { Result } from "../schemas/resultSchema.js"
import type { VideoProcessingOutput } from "./videoProcessingOutput.js"
import type { VideoProcessingRequest } from "./videoProcessingRequestSchema.js"

export type VideoProcessingAdapter = (input: VideoProcessingRequest) => Promise<Result<VideoProcessingOutput>>
