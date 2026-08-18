import * as v from "valibot"

export const idSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/))

export type Id = v.InferOutput<typeof idSchema>
