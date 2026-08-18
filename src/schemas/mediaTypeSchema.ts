import * as v from "valibot"

export const mediaTypeSchema = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/))

export type MediaType = v.InferOutput<typeof mediaTypeSchema>
