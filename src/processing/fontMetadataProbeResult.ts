import type { FontMetadata } from "../metadata/fontMetadataSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type FontMetadataProbeResult = {
  metadata: FontMetadata
  provenance: ProcessingProvenance
}
