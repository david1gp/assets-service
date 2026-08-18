import * as v from "valibot"

export const outputKeySchema = v.pipe(
  v.string(),
  v.transform((key) => key.normalize("NFC")),
  v.minLength(1),
  v.maxLength(128),
  v.check((key) => !/[\\/]/.test(key)),
  v.check((key) => key !== "." && key !== ".."),
  v.check((key) => !/\p{Cc}/u.test(key)),
)

export type OutputKey = v.InferOutput<typeof outputKeySchema>
