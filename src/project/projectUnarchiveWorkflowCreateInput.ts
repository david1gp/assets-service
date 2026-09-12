import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../backup/rcloneBackupRestoreAdapter.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { WorkflowApiRepository } from "../workflow/workflowApiRepository.js"
import type { WranglerCommandRunner } from "../wrangler/wranglerCommandRunner.js"
import type { ProjectRepository } from "./projectRepository.js"

export type ProjectUnarchiveWorkflowCreateInput = {
  projectRepository: Pick<ProjectRepository, "projectRead" | "environmentsRead" | "projectArchiveStateWrite">
  assetApiRepository: Pick<
    AssetApiRepository,
    "assetsRead" | "assetRead" | "assetSourceEnvironmentRead" | "assetOutputBlobRead" | "assetReprocess"
  >
  backupApiRepository: Pick<BackupApiRepository, "backupReceiptsRead">
  restore: RcloneBackupRestoreAdapter
  storage: StorageAdapter
  storageBindingsRead: () => Result<readonly StorageBinding[]>
  wranglerRunner: WranglerCommandRunner
  workflowApiRepository: Pick<WorkflowApiRepository, "workflowRead" | "workflowRetry">
  wranglerProfile?: string
  temporaryDirectory?: string
  workflowCompletionTimeoutMs?: number
  workflowPollMs?: number
}
