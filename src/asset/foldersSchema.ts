import * as v from "valibot"

import { folderSegmentSchema } from "./folderSegmentSchema.js"

export const foldersSchema = v.pipe(
  v.array(folderSegmentSchema),
  v.maxLength(3),
  v.check((folders) => folders.every((folder, index) => index === 0 || folder.length > 0)),
)

export type Folders = v.InferOutput<typeof foldersSchema>
