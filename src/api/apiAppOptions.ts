import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { AuditApiRepository } from "../audit/auditApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { CatalogApiRepository } from "../catalog/catalogApiRepository.js"
import type { CatalogPublicationService } from "../catalog/catalogPublicationService.js"
import type { DeletionApiRepository } from "../deletion/deletionApiRepository.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import type { ProjectArchiveWorkflow } from "../project/projectArchiveWorkflow.js"
import type { ProjectUnarchiveWorkflow } from "../project/projectUnarchiveWorkflow.js"
import type { R2BucketCredentialRepository } from "../r2/r2BucketCredentialRepository.js"
import type { StorageMigrationRepository } from "../migration/storageMigrationRepository.js"
import type { StorageMigrationCreateInput } from "../migration/storageMigrationCreateInputSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { UploadApiRepository } from "../upload/uploadApiRepository.js"
import type { WorkflowApiRepository } from "../workflow/workflowApiRepository.js"
import type { ApiAuthenticationOptions } from "./apiAuthenticationOptions.js"

export type ApiAppOptions = {
  authentication: ApiAuthenticationOptions
  projectRepository: ProjectRepository
  projectArchiveWorkflow?: ProjectArchiveWorkflow
  projectUnarchiveWorkflow?: ProjectUnarchiveWorkflow
  r2BucketCredentialRepository?: Pick<R2BucketCredentialRepository, "r2BucketCredentialRead">
  storageMigrationRepository?: StorageMigrationRepository
  storageMigrationWorkflowEnqueue?: (
    input: StorageMigrationCreateInput,
  ) => Result<{ migrationId: string; workflowId: string }>
  assetApiRepository?: AssetApiRepository
  storage?: StorageAdapter
  uploadApiRepository?: UploadApiRepository
  deletionApiRepository?: DeletionApiRepository
  workflowApiRepository?: WorkflowApiRepository
  backupApiRepository?: BackupApiRepository
  catalogApiRepository?: CatalogApiRepository
  catalogPublicationService?: CatalogPublicationService
  auditApiRepository?: AuditApiRepository
  readinessCheck?: () => Result<true> | Promise<Result<true>>
  requestIdCreate?: (request: Request) => string
}
