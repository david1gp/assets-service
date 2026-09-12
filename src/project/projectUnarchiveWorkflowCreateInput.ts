import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../backup/rcloneBackupRestoreAdapter.js"
import type { R2BucketCredentialCreateInput } from "../r2/r2BucketCredentialCreateInputSchema.js"
import type { R2BucketCredentialRepository } from "../r2/r2BucketCredentialRepository.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { WorkflowApiRepository } from "../workflow/workflowApiRepository.js"
import type { WranglerCommandRunner } from "../wrangler/wranglerCommandRunner.js"
import type { ProjectRepository } from "./projectRepository.js"
import type { ProjectStorageDomainRepository } from "./projectStorageDomainRepository.js"

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
  projectStorageDomainRepository?: Pick<ProjectStorageDomainRepository, "projectStorageDomainsForBucketRead">
  r2BucketCredentialRepository?: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialRead" | "r2BucketCredentialCreate"
  >
  r2BucketCredentialCreate?: (input: {
    accountId: string
    apiToken: string
    bucket: string
    name?: string
  }) => Promise<Result<R2BucketCredentialCreateInput>>
  unarchiveLogger?: (entry: {
    event: "phase" | "error"
    operation: "projectUnarchiveWorkflow"
    phase:
      | "preflight"
      | "bucket-recreation"
      | "credential-recreation"
      | "domain-restoration"
      | "source-restoration"
      | "output-regeneration"
      | "complete"
    projectId: string
    bucket?: string
    customDomain?: string
    sourceRevisionId?: string
    assetId?: string
    error?: string
  }) => void
}
