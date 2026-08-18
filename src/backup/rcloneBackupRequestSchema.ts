import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { folderSegmentSchema } from "../asset/folderSegmentSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const rcloneBackupRequestSchema = v.strictObject({
  localSourcePath: v.pipe(v.string(), v.minLength(1)),
  projectId: idSchema,
  sourceRevisionId: idSchema,
  jobId: idSchema,
  organizationName: folderSegmentSchema,
  projectName: folderSegmentSchema,
  logicalFolders: foldersSchema,
  originalFilename: assetFilenameSchema,
  expectedByteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expectedSha256: sha256Schema,
  timeoutMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export type RcloneBackupRequest = v.InferOutput<typeof rcloneBackupRequestSchema>
