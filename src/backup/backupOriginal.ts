import * as v from "valibot"

import type { Result } from "../schemas/resultSchema.js"
import { backupReceiptCreate } from "./backupReceiptCreate.js"
import type { BackupReceipt } from "./backupReceiptSchema.js"
import type { RcloneBackupAdapter } from "./rcloneBackupAdapter.js"
import type { BackupOriginalOptions } from "./backupOriginalOptions.js"
import { type RcloneBackupRequest, rcloneBackupRequestSchema } from "./rcloneBackupRequestSchema.js"
import { rcloneErrorCreate } from "./rcloneErrorCreate.js"
import { rcloneRemotePathCreate } from "./rcloneRemotePathCreate.js"

export const backupOriginal = async (
  input: RcloneBackupRequest,
  adapter: RcloneBackupAdapter,
  options: BackupOriginalOptions = {},
): Promise<Result<BackupReceipt>> => {
  const op = "backupOriginal"
  const parsed = v.safeParse(rcloneBackupRequestSchema, input)
  if (!parsed.success) return rcloneErrorCreate(op, "invalid_request", v.summarize(parsed.issues), input)
  const request = parsed.output

  const path = rcloneRemotePathCreate({
    remote: "gdrive_beta",
    backupRoot: "backups",
    organizationName: request.organizationName,
    projectName: request.projectName,
    logicalFolders: request.logicalFolders,
    sourceRevisionId: request.sourceRevisionId,
    originalFilename: request.originalFilename,
  })
  if (!path.success) return path

  const existing = options.existingReceipt
  if (
    existing?.checkResult === "verified" &&
    existing.projectId === request.projectId &&
    existing.sourceRevisionId === request.sourceRevisionId &&
    existing.remotePath === path.data &&
    existing.byteSize === request.expectedByteSize &&
    existing.sha256 === request.expectedSha256
  ) {
    return { success: true, data: existing }
  }

  const result = await adapter(request, options)
  if (!result.success) return result
  return backupReceiptCreate({
    id: options.receiptId ?? crypto.randomUUID(),
    projectId: request.projectId,
    sourceRevisionId: request.sourceRevisionId,
    jobId: request.jobId,
    result: result.data,
  })
}
