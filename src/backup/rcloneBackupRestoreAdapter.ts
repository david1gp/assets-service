import type { Result } from "../schemas/resultSchema.js"
import type { RcloneBackupRestoreRequest } from "./rcloneBackupRestoreRequestSchema.js"
import type { RcloneBackupRestoreResult } from "./rcloneBackupRestoreResultSchema.js"
import type { RcloneOperationOptions } from "./rcloneOperationOptions.js"

export type RcloneBackupRestoreAdapter = (
  request: RcloneBackupRestoreRequest,
  options?: RcloneOperationOptions,
) => Promise<Result<RcloneBackupRestoreResult>>
