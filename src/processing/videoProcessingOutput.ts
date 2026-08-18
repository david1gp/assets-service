import type { VideoMetadata } from "../metadata/videoMetadataSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type VideoProcessingOutput = {
  bytes: Uint8Array
  metadata: VideoMetadata
  provenance: ProcessingProvenance
}
