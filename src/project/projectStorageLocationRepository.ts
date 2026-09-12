import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectStorageLocationCreateInput } from "./projectStorageLocationCreateInputSchema.js"
import type { ProjectStorageLocation } from "./projectStorageLocationSchema.js"

export type ProjectStorageLocationRepository = {
  projectStorageLocationCreate: (
    input: ProjectStorageLocationCreateInput,
    transaction?: AssetDatabase,
  ) => Result<ProjectStorageLocation>
  projectStorageLocationsRead: (
    projectId: string,
    transaction?: AssetDatabase,
  ) => Result<readonly ProjectStorageLocation[]>
  projectStorageLocationsAllRead: (transaction?: AssetDatabase) => Result<readonly ProjectStorageLocation[]>
}
