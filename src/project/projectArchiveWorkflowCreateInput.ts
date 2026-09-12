import type { AssetApiRepository } from "../asset/assetApiRepository.js"
import type { BackupApiRepository } from "../backup/backupApiRepository.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { WranglerCommandRunner } from "../wrangler/wranglerCommandRunner.js"
import type { ProjectRepository } from "./projectRepository.js"

export type ProjectArchiveWorkflowCreateInput = {
  projectRepository: ProjectRepository
  assetApiRepository: Pick<AssetApiRepository, "assetsRead">
  backupApiRepository: Pick<BackupApiRepository, "backupReceiptsRead">
  storage: StorageAdapter
  storageBindingsRead: () => Result<readonly StorageBinding[]>
  wranglerRunner: WranglerCommandRunner
  wranglerProfile?: string
  storageObjectListMaxKeys?: number
}
