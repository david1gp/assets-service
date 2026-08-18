import * as v from "valibot"

export const assetFilenameSchema = v.pipe(
  v.string(),
  v.transform((filename) => filename.normalize("NFC")),
  v.minLength(1),
  v.maxLength(255),
  v.check((filename) => !/[\\/]/.test(filename)),
  v.check((filename) => filename !== "." && filename !== ".."),
  v.check((filename) => !/\p{Cc}/u.test(filename)),
)

export type AssetFilename = v.InferOutput<typeof assetFilenameSchema>
