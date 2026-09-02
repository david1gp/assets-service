import type { StorageMigrationRepository } from "../migration/storageMigrationRepository.js"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const storageMutationAssert = (
  repository: Pick<StorageMigrationRepository, "storageMigrationReadActive">,
  environmentIds: string | readonly string[],
  transaction?: AssetDatabase,
): Result<null> => {
  const op = "storageMutationAssert"
  const ids = typeof environmentIds === "string" ? [environmentIds] : environmentIds
  for (const environmentId of ids) {
    const active = repository.storageMigrationReadActive(environmentId, transaction)
    if (!active.success) return active
    if (active.data !== null)
      return resultErrorCreate(
        op,
        `A storage migration is already active for environment ${environmentId}`,
        {
          code: "storage_migration_active",
          environmentId,
          migrationId: active.data.id,
          status: active.data.status,
        },
        { retryable: true },
      )
  }
  return { success: true, data: null }
}
