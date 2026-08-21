import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { AuditApiRepository } from "../audit/auditApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { CatalogApiRepository } from "../catalog/catalogApiRepository.js"
import type { DeletionApiRepository } from "../deletion/deletionApiRepository.js"
import type { LegacyImportExecutor } from "../import/legacyImportExecutor.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { UploadApiRepository } from "../upload/uploadApiRepository.js"
import type { WorkflowApiRepository } from "../workflow/workflowApiRepository.js"
import type { ApiAuthenticationOptions } from "./apiAuthenticationOptions.js"

export type ApiAppOptions = {
  authentication: ApiAuthenticationOptions
  projectRepository: ProjectRepository
  assetApiRepository?: AssetApiRepository
  storage?: StorageAdapter
  uploadApiRepository?: UploadApiRepository
  deletionApiRepository?: DeletionApiRepository
  workflowApiRepository?: WorkflowApiRepository
  backupApiRepository?: BackupApiRepository
  catalogApiRepository?: CatalogApiRepository
  auditApiRepository?: AuditApiRepository
  legacyImportExecutor?: LegacyImportExecutor
  readinessCheck?: () => Result<true> | Promise<Result<true>>
  requestIdCreate?: (request: Request) => string
}
