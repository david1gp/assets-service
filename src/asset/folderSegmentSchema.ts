import * as v from "valibot"

export const folderSegmentSchema = v.pipe(
  v.string(),
  v.transform((segment) => segment.normalize("NFC")),
  v.minLength(1),
  v.maxLength(128),
  v.check((segment) => !/[\\/]/.test(segment)),
  v.check((segment) => segment !== "." && segment !== ".."),
  v.check((segment) => !/\p{Cc}/u.test(segment)),
)

export type FolderSegment = v.InferOutput<typeof folderSegmentSchema>
