import * as v from "valibot"

export const assetBasenameSchema = v.pipe(
  v.string(),
  v.transform((basename) => basename.normalize("NFC")),
  v.minLength(1),
  v.maxLength(255),
  v.check((basename) => !/[\\/]/.test(basename)),
  v.check((basename) => basename !== "." && basename !== ".."),
  v.check((basename) => !/\p{Cc}/u.test(basename)),
)

export type AssetBasename = v.InferOutput<typeof assetBasenameSchema>
