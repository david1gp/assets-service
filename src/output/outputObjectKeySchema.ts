import * as v from "valibot"

export const outputObjectKeySchema = v.pipe(
  v.string(),
  v.transform((key) => key.normalize("NFC")),
  v.minLength(1),
  v.check((key) => !key.startsWith("/")),
  v.check((key) => !/^[A-Za-z]:[\\/]/.test(key)),
  v.check((key) => !key.includes("\\")),
  v.check((key) => !/\p{Cc}/u.test(key)),
  v.check((key) => key.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")),
)

export type OutputObjectKey = v.InferOutput<typeof outputObjectKeySchema>
