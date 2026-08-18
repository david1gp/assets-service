import type { VideoMetadata } from "../metadata/videoMetadataSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type VideoMetadataProbeResult = {
  metadata: VideoMetadata
  provenance: ProcessingProvenance
}
