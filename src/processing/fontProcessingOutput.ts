import type { FontMetadata } from "../metadata/fontMetadataSchema.js"
import type { FontOutputFormat } from "./fontOutputFormatSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type FontProcessingOutput = {
  sourceBytes: Uint8Array
  bytes: Uint8Array
  outputFormat: FontOutputFormat
  metadata: FontMetadata
  provenance: ProcessingProvenance
}
