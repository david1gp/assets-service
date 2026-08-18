import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { videoMetadataSchema } from "../metadata/videoMetadataSchema.js"
import { processingProvenanceSchema } from "./processingProvenanceSchema.js"
import { videoMetadataProbeFfprobe } from "./videoMetadataProbeFfprobe.js"
import type { VideoProcessingAdapter } from "./videoProcessingAdapter.js"
import type { VideoProcessingOutput } from "./videoProcessingOutput.js"
import { videoProcessingRequestSchema, type VideoProcessingRequest } from "./videoProcessingRequestSchema.js"
import type { VideoMetadataProbeAdapter } from "./videoMetadataProbeAdapter.js"

export function videoProcess(
  input: VideoProcessingRequest,
  probe?: VideoMetadataProbeAdapter,
): Promise<Result<VideoProcessingOutput>>
export function videoProcess(
  input: VideoProcessingRequest,
  adapter: VideoProcessingAdapter,
): Promise<Result<VideoProcessingOutput>>
export async function videoProcess(
  input: VideoProcessingRequest,
  dependency: VideoMetadataProbeAdapter | VideoProcessingAdapter = videoMetadataProbeFfprobe,
): Promise<Result<VideoProcessingOutput>> {
  const op = "videoProcess"
  const parsed = v.safeParse(videoProcessingRequestSchema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, v.summarize(parsed.issues), input)
  }

  if (dependency.length === 1) {
    try {
      return await (dependency as VideoProcessingAdapter)(parsed.output)
    } catch (error) {
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
    }
  }

  let probed: Awaited<ReturnType<VideoMetadataProbeAdapter>>
  try {
    probed = await (dependency as VideoMetadataProbeAdapter)(parsed.output.sourceBytes, parsed.output.sourceName)
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
  if (!probed.success) {
    return probed
  }
  const metadata = v.safeParse(videoMetadataSchema, probed.data.metadata)
  if (!metadata.success) {
    return resultErrorCreate(op, v.summarize(metadata.issues), probed.data.metadata)
  }
  const provenance = v.safeParse(processingProvenanceSchema, probed.data.provenance)
  if (!provenance.success) {
    return resultErrorCreate(op, v.summarize(provenance.issues), probed.data.provenance)
  }

  return {
    success: true,
    data: {
      bytes: new Uint8Array(parsed.output.sourceBytes),
      metadata: metadata.output,
      provenance: provenance.output,
    },
  }
}
