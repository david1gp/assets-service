import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectStorageDomainCreateInput } from "./projectStorageDomainCreateInputSchema.js"
import type { ProjectStorageDomain } from "./projectStorageDomainSchema.js"

export type ProjectStorageDomainRepository = {
  projectStorageDomainCreate: (
    input: ProjectStorageDomainCreateInput,
    transaction?: AssetDatabase,
  ) => Result<ProjectStorageDomain>
  projectStorageDomainsRead: (projectId: string, transaction?: AssetDatabase) => Result<readonly ProjectStorageDomain[]>
  projectStorageDomainsForBucketRead: (
    bucket: string,
    transaction?: AssetDatabase,
  ) => Result<readonly ProjectStorageDomain[]>
}
