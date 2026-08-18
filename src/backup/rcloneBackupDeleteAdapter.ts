import type { Result } from "../schemas/resultSchema.js"
import type { RcloneOperationOptions } from "./rcloneOperationOptions.js"

export type RcloneBackupDeleteAdapter = (remotePath: string, options?: RcloneOperationOptions) => Promise<Result<void>>
