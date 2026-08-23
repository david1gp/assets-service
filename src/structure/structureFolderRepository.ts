import type { Result } from "../schemas/resultSchema.js"
import type { AssetStructureFolderMembership } from "./assetStructureFolderMembershipSchema.js"
import type { StructureFolderCreateInput } from "./structureFolderCreateInputSchema.js"
import type { StructureFolder } from "./structureFolderSchema.js"
import type { StructureFolderUpdateInput } from "./structureFolderUpdateInputSchema.js"

export type StructureFolderRepository = {
  structureFoldersRead: (projectId: string) => Result<readonly StructureFolder[]>
  structureFolderRead: (projectId: string, structureFolderId: string) => Result<StructureFolder | null>
  structureFolderCreate: (projectId: string, input: StructureFolderCreateInput) => Result<StructureFolder>
  structureFolderUpdate: (
    projectId: string,
    structureFolderId: string,
    input: StructureFolderUpdateInput,
  ) => Result<StructureFolder | null>
  structureFolderDelete: (projectId: string, structureFolderId: string) => Result<StructureFolder | null>
  structureRead: (projectId: string) => Result<{
    folders: readonly StructureFolder[]
    memberships: readonly AssetStructureFolderMembership[]
  }>
  assetStructureFolderMembershipRead: (
    projectId: string,
    assetId: string,
  ) => Result<AssetStructureFolderMembership | null>
  assetStructureFolderMembershipsRead: (projectId: string) => Result<readonly AssetStructureFolderMembership[]>
  assetStructureFolderMembershipSet: (
    projectId: string,
    assetId: string,
    structureFolderId: string | null,
  ) => Result<AssetStructureFolderMembership | null>
}
