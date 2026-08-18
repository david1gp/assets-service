import * as v from "valibot"

export const isoDateSchema = v.pipe(v.string(), v.isoTimestamp())

export type IsoDate = v.InferOutput<typeof isoDateSchema>
