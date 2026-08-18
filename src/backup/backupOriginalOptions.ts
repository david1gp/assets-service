import type { BackupReceipt } from "./backupReceiptSchema.js"
import type { RcloneOperationOptions } from "./rcloneOperationOptions.js"

export type BackupOriginalOptions = RcloneOperationOptions & {
  receiptId?: string
  existingReceipt?: BackupReceipt
}
