import type { BackupStatus } from "./backupStatusSchema.js"
import type { BackupReceipt } from "./backupReceiptSchema.js"
import type { Result } from "../schemas/resultSchema.js"

type BackupListOptions = {
  cursor?: number
  limit?: number
  sourceRevisionId?: string
  assetId?: string
  checkResult?: BackupReceipt["checkResult"]
}
type BackupPage = { items: readonly BackupReceipt[]; nextCursor: number | null }

export type BackupApiRepository = {
  backupReceiptsRead: (projectId: string, options: BackupListOptions) => Result<BackupPage>
  backupReceiptRead: (projectId: string, receiptId: string) => Result<BackupReceipt | null>
  backupStatusRead: (projectId: string, sourceRevisionId: string) => Result<BackupStatus | null>
  backupAssetStatusRead?: (projectId: string, assetId: string) => Result<BackupStatus | null>
}
