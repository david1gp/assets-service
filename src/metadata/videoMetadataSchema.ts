import * as v from "valibot"

export const videoMetadataSchema = v.strictObject({
  kind: v.literal("video"),
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  durationSeconds: v.pipe(v.number(), v.minValue(0)),
  frameRate: v.pipe(v.number(), v.minValue(0)),
  container: v.pipe(v.string(), v.minLength(1)),
  videoCodec: v.pipe(v.string(), v.minLength(1)),
  audioCodec: v.nullable(v.string()),
  streams: v.pipe(v.number(), v.integer(), v.minValue(1)),
  bitrate: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
})

export type VideoMetadata = v.InferOutput<typeof videoMetadataSchema>
