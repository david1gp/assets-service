import type { ImageMetadata } from "../metadata/imageMetadataSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type ImageProcessingOutput = {
  bytes: Uint8Array
  metadata: ImageMetadata
  provenance: ProcessingProvenance
}
