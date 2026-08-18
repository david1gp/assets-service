import type { Result } from "../schemas/resultSchema.js"
import type { VideoMetadataProbeResult } from "./videoMetadataProbeResult.js"

export type VideoMetadataProbeAdapter = (
  sourceBytes: Uint8Array,
  sourceName?: string,
) => Promise<Result<VideoMetadataProbeResult>>
