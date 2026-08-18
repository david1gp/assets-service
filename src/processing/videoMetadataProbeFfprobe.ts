import * as v from "valibot"

import { videoMetadataSchema } from "../metadata/videoMetadataSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { VideoMetadataProbeResult } from "./videoMetadataProbeResult.js"

const ffprobeJsonSchema = v.looseObject({
  streams: v.optional(v.array(v.unknown())),
  format: v.optional(v.unknown()),
})

export const videoMetadataProbeFfprobe = async (
  sourceBytes: Uint8Array,
  _sourceName?: string,
): Promise<Result<VideoMetadataProbeResult>> => {
  const op = "videoMetadataProbeFfprobe"

  try {
    const process = Bun.spawn(
      ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-i", "pipe:0"],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    )
    process.stdin.write(sourceBytes)
    process.stdin.end()
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    if (exitCode !== 0) {
      return resultErrorCreate(op, `ffprobe exited with code ${exitCode}: ${stderr || stdout}`.trim())
    }

    const raw = parseJson(stdout)
    if (!raw.success) {
      return resultErrorCreate(op, raw.errorMessage, stdout)
    }
    const parsed = v.safeParse(ffprobeJsonSchema, raw.data)
    if (!parsed.success) {
      return resultErrorCreate(op, v.summarize(parsed.issues), raw.data)
    }
    const streams = parsed.output.streams ?? []
    const format = isRecord(parsed.output.format) ? parsed.output.format : {}
    const videoStream = streams.find((stream) => isRecord(stream) && stream.codec_type === "video")
    if (!isRecord(videoStream)) {
      return resultErrorCreate(op, "ffprobe returned no video stream")
    }
    const audioStream = streams.find((stream) => isRecord(stream) && stream.codec_type === "audio")
    const metadata = {
      kind: "video" as const,
      width: numberOrZero(videoStream.width),
      height: numberOrZero(videoStream.height),
      durationSeconds: numberOrZero(videoStream.duration) || numberOrZero(format.duration),
      frameRate: ratioOrZero(videoStream.avg_frame_rate) || ratioOrZero(videoStream.r_frame_rate),
      container: stringOrFallback(format.format_name, "unknown"),
      videoCodec: stringOrFallback(videoStream.codec_name, "unknown"),
      audioCodec: stringOrNull(isRecord(audioStream) ? audioStream.codec_name : undefined),
      streams: Math.max(1, streams.length),
      bitrate: numberOrNull(format.bit_rate ?? videoStream.bit_rate),
    }
    const validated = v.safeParse(videoMetadataSchema, metadata)
    if (!validated.success) {
      return resultErrorCreate(op, v.summarize(validated.issues), metadata)
    }

    const version = await ffprobeVersionRead()
    if (!version.success) {
      return version
    }
    return {
      success: true,
      data: {
        metadata: validated.output,
        provenance: {
          schemaVersion: "assets-service.processing.v1",
          toolchain: [{ name: "ffprobe", version: version.data }],
        },
      },
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

function parseJson(value: string): Result<unknown> {
  try {
    return { success: true, data: JSON.parse(value) as unknown }
  } catch (error) {
    return resultErrorCreate("videoMetadataProbeFfprobe", error instanceof Error ? error.message : String(error))
  }
}

async function ffprobeVersionRead(): Promise<Result<string>> {
  const op = "videoMetadataProbeFfprobeVersionRead"
  try {
    const process = Bun.spawn(["ffprobe", "-version"], { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    if (exitCode !== 0) {
      return resultErrorCreate(op, `ffprobe exited with code ${exitCode}: ${stderr || stdout}`.trim())
    }
    const match = /^ffprobe version ([^\s]+)/m.exec(stdout)
    if (!match?.[1]) {
      return resultErrorCreate(op, "ffprobe did not report a version", stdout)
    }
    return { success: true, data: match[1] }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function numberOrZero(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
}

function ratioOrZero(value: unknown): number {
  if (typeof value !== "string") {
    return numberOrZero(value)
  }
  const parts = value.split("/")
  const numerator = Number(parts[0])
  const denominator = Number(parts[1])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0
  }
  return numerator / denominator
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? (value.split(",")[0] ?? fallback) : fallback
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
