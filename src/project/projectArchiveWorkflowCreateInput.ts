import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../backup/rcloneBackupRestoreAdapter.js"
import type { R2BucketCredentialRepository } from "../r2/r2BucketCredentialRepository.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { WranglerCommandRunner } from "../wrangler/wranglerCommandRunner.js"
import type { ProjectRepository } from "./projectRepository.js"
import type { ProjectStorageDomainRepository } from "./projectStorageDomainRepository.js"

export type ProjectArchiveWorkflowCreateInput = {
  projectRepository: ProjectRepository
  assetApiRepository: Pick<AssetApiRepository, "assetsRead" | "assetRead">
  backupApiRepository: Pick<BackupApiRepository, "backupReceiptsRead">
  restore: RcloneBackupRestoreAdapter
  storage: StorageAdapter
  storageBindingsRead: () => Result<readonly StorageBinding[]>
  wranglerRunner: WranglerCommandRunner
  wranglerProfile?: string
  storageObjectListMaxKeys?: number
  temporaryDirectory?: string
  projectStorageDomainRepository?: Pick<ProjectStorageDomainRepository, "projectStorageDomainsForBucketRead">
  r2BucketCredentialRepository?: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialRead" | "r2BucketCredentialDelete"
  >
  r2BucketCredentialRevoke?: (input: {
    accountId: string
    apiToken: string
    revocationId: string
  }) => Promise<Result<boolean>>
  archiveLogger?: (entry: {
    event: "phase" | "error"
    operation: "projectArchiveWorkflow"
    phase: "preflight" | "storage-cleanup" | "domain-cleanup" | "bucket-cleanup" | "credential-cleanup" | "complete"
    projectId: string
    bucket?: string
    prefix?: string
    error?: string
  }) => void
}
