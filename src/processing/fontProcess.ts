import ttf2woff2 from "ttf2woff2"
import * as v from "valibot"

import { fontOutputFormatSchema } from "./fontOutputFormatSchema.js"
import { fontMetadataProbe } from "./fontMetadataProbe.js"
import type { FontMetadataProbeAdapter } from "./fontMetadataProbeAdapter.js"
import type { FontProcessingAdapter } from "./fontProcessingAdapter.js"
import type { FontProcessingOutput } from "./fontProcessingOutput.js"
import { fontProcessingRequestSchema, type FontProcessingRequest } from "./fontProcessingRequestSchema.js"
import { fontMetadataSchema } from "../metadata/fontMetadataSchema.js"
import { processingProvenanceSchema } from "./processingProvenanceSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { ProcessingToolchain } from "./processingToolchainSchema.js"
import type { Result } from "../schemas/resultSchema.js"

export function fontProcess(
  input: FontProcessingRequest,
  probe?: FontMetadataProbeAdapter,
): Result<FontProcessingOutput>
export function fontProcess(input: FontProcessingRequest, adapter: FontProcessingAdapter): Result<FontProcessingOutput>
export function fontProcess(
  input: FontProcessingRequest,
  dependency: FontMetadataProbeAdapter | FontProcessingAdapter = fontMetadataProbe,
): Result<FontProcessingOutput> {
  const op = "fontProcess"
  const parsed = v.safeParse(fontProcessingRequestSchema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, v.summarize(parsed.issues), input)
  }
  const request = parsed.output
  const outputFormat = request.outputFormat ?? "woff2"
  const validatedOutputFormat = v.safeParse(fontOutputFormatSchema, outputFormat)
  if (!validatedOutputFormat.success) {
    return resultErrorCreate(op, "font output format is not supported", outputFormat)
  }

  if (dependency.length === 1) {
    try {
      return (dependency as FontProcessingAdapter)(request)
    } catch (error) {
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
    }
  }

  let probed: ReturnType<FontMetadataProbeAdapter>
  try {
    probed = (dependency as FontMetadataProbeAdapter)(request.sourceBytes, request.sourceName)
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
  if (!probed.success) {
    return probed
  }
  const metadata = v.safeParse(fontMetadataSchema, probed.data.metadata)
  if (!metadata.success) {
    return resultErrorCreate(op, v.summarize(metadata.issues), probed.data.metadata)
  }
  const provenance = v.safeParse(processingProvenanceSchema, probed.data.provenance)
  if (!provenance.success) {
    return resultErrorCreate(op, v.summarize(provenance.issues), probed.data.provenance)
  }
  if (metadata.output.format !== "ttf" && metadata.output.format !== "otf" && metadata.output.format !== "woff2") {
    return resultErrorCreate(op, `font source format "${metadata.output.format}" is not supported`)
  }

  try {
    const sourceBytes = new Uint8Array(request.sourceBytes)
    const outputMetadata = {
      ...metadata.output,
      format: outputFormat,
    }
    const parsedOutputMetadata = v.safeParse(fontMetadataSchema, outputMetadata)
    if (!parsedOutputMetadata.success) {
      return resultErrorCreate(op, v.summarize(parsedOutputMetadata.issues), outputMetadata)
    }
    const outputBytes =
      metadata.output.format === "woff2" ? sourceBytes : new Uint8Array(ttf2woff2(Buffer.from(sourceBytes)))
    const toolchain: ProcessingToolchain[] = [...provenance.output.toolchain]
    if (metadata.output.format !== "woff2") {
      toolchain.push({ name: "ttf2woff2", version: "8.0.1" })
    }
    return {
      success: true,
      data: {
        sourceBytes,
        bytes: outputBytes,
        outputFormat: validatedOutputFormat.output,
        metadata: parsedOutputMetadata.output,
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain,
        },
      },
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
