import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"

export const moveAssetRequestSchema = v.pipe(
  v.strictObject({
    path: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(1024))),
    to: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(1024))),
    folders: v.optional(foldersSchema),
    filename: v.optional(assetFilenameSchema),
  }),
  v.check(
    (input) =>
      (input.path !== undefined) !== (input.to !== undefined) ||
      (input.path === undefined &&
        input.to === undefined &&
        input.folders !== undefined &&
        input.filename !== undefined),
    "Move target must be a path or a folder and filename pair",
  ),
)

export type MoveAssetRequest = v.InferOutput<typeof moveAssetRequestSchema>
