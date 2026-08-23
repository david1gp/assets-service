import type { Asset } from "./assetSchema.js"
import type { Folders } from "./foldersSchema.js"
import type { OutputDefinitionInput } from "../api-client/outputDefinitionInputSchema.js"
import type { DeletionState } from "../deletion/deletionStateSchema.js"
import type { AssetMetadata } from "../metadata/assetMetadataSchema.js"
import type { OutputDefinition } from "../output/outputDefinitionSchema.js"
import type { OutputVersion } from "../output/outputVersionSchema.js"
import type { SourceRevision } from "../upload/sourceRevisionSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import type { EnvironmentName } from "../schemas/environmentNameSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StructureFolderRepository } from "../structure/structureFolderRepository.js"

export type AssetOutputHistory = {
  definition: OutputDefinition
  versions: readonly OutputVersion[]
}

export type AssetDetail = Asset & {
  sourcePath: string
  sourceHistory: readonly SourceRevision[]
  outputHistory: readonly AssetOutputHistory[]
  metadata: AssetMetadata | null
}

export type AssetListItem = Asset & {
  sourcePath: string
  outputCount: number
  deletionStatus?: DeletionState["status"]
}

export type AssetMoveInput = {
  folders: Folders
  filename: string
}

export type AssetOutputSetInput = {
  outputs: readonly OutputDefinitionInput[]
}

export type AssetApiMutation = {
  asset: AssetDetail
  workflowId?: string
}

export type AssetApiRepository = {
  assetsRead: (projectId: string, assetClass?: AssetClass) => Result<readonly AssetListItem[]>
  assetRead: (projectId: string, assetId: string) => Result<AssetDetail | null>
  assetSourceEnvironmentRead: (
    projectId: string,
    assetId: string,
    sourceRevisionId: string,
  ) => Result<EnvironmentName | null>
  assetOutputBlobRead: (
    projectId: string,
    assetId: string,
    outputVersionId: string,
  ) => Result<{
    storage: "private" | "public"
    environment: EnvironmentName
    objectKey: string
    byteSize: number
    mediaType: string
  } | null>
  assetOutputAdd: (projectId: string, assetId: string, input: OutputDefinitionInput) => Result<AssetApiMutation | null>
  assetOutputRemove: (projectId: string, assetId: string, outputKey: string) => Result<AssetApiMutation | null>
  assetOutputsRead: (projectId: string, assetId: string) => Result<readonly OutputDefinition[] | null>
  assetOutputsSet: (projectId: string, assetId: string, input: AssetOutputSetInput) => Result<AssetApiMutation | null>
  assetMetadataSet: (projectId: string, assetId: string, alt: string) => Result<AssetApiMutation | null>
  assetMetadataUnset: (projectId: string, assetId: string, field: "alt") => Result<AssetApiMutation | null>
  assetMove: (projectId: string, assetId: string, input: AssetMoveInput) => Result<Asset | null>
} & Partial<StructureFolderRepository>
