import * as v from "valibot"

import { documentExtensionMediaTypes } from "../document/documentExtensionMediaTypes.js"
import { documentExtensionSchema } from "../document/documentExtensionSchema.js"
import { documentMetadataSchema } from "../metadata/documentMetadataSchema.js"
import { processingProvenanceSchema } from "./processingProvenanceSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { DocumentProcessingOutput } from "./documentProcessingOutput.js"
import { documentProcessingRequestSchema, type DocumentProcessingRequest } from "./documentProcessingRequestSchema.js"

export const documentProcess = (input: DocumentProcessingRequest): Result<DocumentProcessingOutput> => {
  const op = "documentProcess"
  const parsed = v.safeParse(documentProcessingRequestSchema, input)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)

  const extension = extensionRead(parsed.output.sourceName)
  const parsedExtension = v.safeParse(documentExtensionSchema, extension)
  if (!parsedExtension.success) return resultErrorCreate(op, "Document filename extension is not supported", input)
  if (documentExtensionMediaTypes[parsedExtension.output] !== parsed.output.mediaType)
    return resultErrorCreate(op, "Document media type does not match its filename extension", input)

  const metadata = v.safeParse(documentMetadataSchema, {
    kind: "document",
    extension: parsedExtension.output,
    mediaType: parsed.output.mediaType,
  })
  if (!metadata.success) return resultErrorCreate(op, v.summarize(metadata.issues), metadata.issues)
  const provenance = v.safeParse(processingProvenanceSchema, {
    schemaVersion: "assets-service.processing.v1",
    toolchain: [{ name: "passthrough", version: "1" }],
  })
  if (!provenance.success) return resultErrorCreate(op, v.summarize(provenance.issues), provenance.issues)

  return {
    success: true,
    data: {
      bytes: new Uint8Array(parsed.output.sourceBytes),
      metadata: metadata.output,
      provenance: provenance.output,
    },
  }
}

function extensionRead(filename: string): string {
  const lastDot = filename.lastIndexOf(".")
  return lastDot < 0 ? "" : filename.slice(lastDot + 1).toLowerCase()
}
