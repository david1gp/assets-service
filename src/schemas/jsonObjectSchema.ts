import * as v from "valibot"

export const jsonObjectSchema = v.record(v.string(), v.unknown())

export type JsonObject = v.InferOutput<typeof jsonObjectSchema>
