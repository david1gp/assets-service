import * as v from "valibot"

import { assetFilenameSchema } from "../asset/assetFilenameSchema.js"
import { folderSegmentSchema } from "../asset/folderSegmentSchema.js"
import { foldersSchema } from "../asset/foldersSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const rcloneRemotePathInputSchema = v.strictObject({
  remote: v.string(),
  backupRoot: v.string(),
  organizationName: folderSegmentSchema,
  projectName: folderSegmentSchema,
  logicalFolders: foldersSchema,
  sourceRevisionId: idSchema,
  originalFilename: assetFilenameSchema,
})

export const rcloneRemotePathCreate = (input: v.InferInput<typeof rcloneRemotePathInputSchema>): Result<string> => {
  const op = "rcloneRemotePathCreate"
  const parsed = v.safeParse(rcloneRemotePathInputSchema, input)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
  if (parsed.output.remote !== "gdrive_beta") return resultErrorCreate(op, "rclone remote must be exactly gdrive_beta")
  if (parsed.output.backupRoot !== "backups") return resultErrorCreate(op, "rclone backup root must be exactly backups")

  const components = [
    parsed.output.backupRoot,
    parsed.output.organizationName,
    "assets",
    parsed.output.projectName,
    ...parsed.output.logicalFolders,
    parsed.output.sourceRevisionId,
    parsed.output.originalFilename,
  ]
  if (components.some((component) => component.includes(":"))) {
    return resultErrorCreate(op, "rclone paths cannot contain a second remote separator")
  }
  return { success: true, data: `${parsed.output.remote}:${components.join("/")}` }
}
