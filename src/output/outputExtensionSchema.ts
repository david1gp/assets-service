import * as v from "valibot"

export const outputExtensionSchema = v.pipe(
  v.string(),
  v.transform((extension) => extension.normalize("NFC")),
  v.minLength(1),
  v.maxLength(16),
  v.check((extension) => !/[\\/]/.test(extension)),
  v.check((extension) => extension !== "." && extension !== ".."),
  v.check((extension) => !/\p{Cc}/u.test(extension)),
)

export type OutputExtension = v.InferOutput<typeof outputExtensionSchema>
