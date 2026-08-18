import type { DocumentMetadata } from "../metadata/documentMetadataSchema.js"
import type { ProcessingProvenance } from "./processingProvenanceSchema.js"

export type DocumentProcessingOutput = {
  bytes: Uint8Array
  metadata: DocumentMetadata
  provenance: ProcessingProvenance
}
