import type { Result } from "../schemas/resultSchema.js"
import type { RcloneBackupRequest } from "./rcloneBackupRequestSchema.js"
import type { RcloneBackupResult } from "./rcloneBackupResultSchema.js"
import type { RcloneOperationOptions } from "./rcloneOperationOptions.js"

export type RcloneBackupAdapter = (
  request: RcloneBackupRequest,
  options?: RcloneOperationOptions,
) => Promise<Result<RcloneBackupResult>>
