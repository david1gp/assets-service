import * as v from "valibot"

import { folderSegmentSchema } from "./folderSegmentSchema.js"

export const foldersDatabaseColumnsSchema = v.pipe(
  v.strictObject({
    folder1: v.nullable(folderSegmentSchema),
    folder2: v.nullable(folderSegmentSchema),
    folder3: v.nullable(folderSegmentSchema),
  }),
  v.check((folders) => folders.folder2 === null || folders.folder1 !== null),
  v.check((folders) => folders.folder3 === null || folders.folder2 !== null),
)

export type FoldersDatabaseColumns = v.InferOutput<typeof foldersDatabaseColumnsSchema>
