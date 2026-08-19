import type { AssetListItem } from "../api-client/assetListItemSchema.js"
import type { SourceRevisionDeletionEligibilityResponse } from "../api-client/sourceRevisionDeletionEligibilityResponseSchema.js"
import { assetSourcePathCreate } from "../asset/assetSourcePathCreate.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { SourceRevision } from "../upload/sourceRevisionSchema.js"
import { type AssetTargetKeys, assetTargetKeysCreate } from "./assetTargetKeysCreate.js"
import { nfcLexicalCompare } from "./nfcLexicalCompare.js"

export type RemoteAssetHistoryManifestClient = {
  assetsReadAll: (projectId: string, query?: { include?: string }) => Promise<Result<readonly AssetListItem[]>>
  sourceRevisionDeletionEligibilityRead?: (
    projectId: string,
    environment: string,
    sourceRevisionId: string,
  ) => Promise<Result<SourceRevisionDeletionEligibilityResponse>>
}

export type RemoteAssetHistoryManifestEntry = {
  assetId: string
  class: AssetClass
  folders: AssetListItem["folders"]
  filename: string
  sourcePath: string
  logicalPath: string
  keys: AssetTargetKeys
  alt: string | null
  currentSourceRevisionId: string
  sourceHistory: readonly SourceRevision[]
  outputHistory: NonNullable<AssetListItem["outputHistory"]>
  byteSize: number
  sha256: string
  mediaType: string
  deletionEligibility: SourceRevisionDeletionEligibilityResponse | null
  valid: boolean
  errorMessage?: string
}

export type RemoteAssetHistoryManifest = {
  entries: readonly RemoteAssetHistoryManifestEntry[]
}

export type RemoteAssetHistoryManifestLoadInput = {
  client: RemoteAssetHistoryManifestClient
  projectId: string
  environment?: string
}

const entryCreate = (
  asset: AssetListItem,
  sourceHistory: readonly SourceRevision[],
  outputHistory: RemoteAssetHistoryManifestEntry["outputHistory"],
): RemoteAssetHistoryManifestEntry => {
  const current = sourceHistory.find((source) => source.id === asset.currentSourceRevisionId)
  const logicalPath = assetSourcePathCreate(asset.folders, asset.filename)
  const keys = assetTargetKeysCreate(asset.class, asset.folders, asset.filename)
  const metadata = asset.metadata
  const alt = metadata?.metadata.kind === "image" ? metadata.metadata.alt : null
  if (current === undefined) {
    return {
      assetId: asset.id,
      class: asset.class,
      folders: asset.folders,
      filename: asset.filename,
      sourcePath: asset.sourcePath.normalize("NFC"),
      logicalPath,
      keys,
      alt,
      currentSourceRevisionId: asset.currentSourceRevisionId,
      sourceHistory,
      outputHistory,
      byteSize: 0,
      sha256: "",
      mediaType: "",
      deletionEligibility: null,
      valid: false,
      errorMessage: `The current source revision was not returned for asset ${asset.id}`,
    }
  }
  const historyErrorMessage = historyErrorRead(asset, sourceHistory, outputHistory)
  const sourcePath = asset.sourcePath.normalize("NFC")
  const errorMessage =
    historyErrorMessage ??
    (sourcePath !== logicalPath
      ? `The remote source path did not match the logical asset identity for asset ${asset.id}`
      : current.assetId !== asset.id ||
          current.class !== asset.class ||
          current.originalFilename.normalize("NFC") !== asset.filename.normalize("NFC")
        ? `The current source revision did not match asset ${asset.id}`
        : undefined)
  if (errorMessage !== undefined) {
    return {
      assetId: asset.id,
      class: asset.class,
      folders: asset.folders,
      filename: asset.filename,
      sourcePath,
      logicalPath,
      keys,
      alt,
      currentSourceRevisionId: asset.currentSourceRevisionId,
      sourceHistory,
      outputHistory,
      byteSize: 0,
      sha256: "",
      mediaType: "",
      deletionEligibility: null,
      valid: false,
      errorMessage,
    }
  }
  return {
    assetId: asset.id,
    class: asset.class,
    folders: asset.folders,
    filename: asset.filename,
    sourcePath,
    logicalPath,
    keys,
    alt,
    currentSourceRevisionId: asset.currentSourceRevisionId,
    sourceHistory,
    outputHistory,
    byteSize: current.byteSize,
    sha256: current.sha256,
    mediaType: current.mediaType,
    deletionEligibility: null,
    valid: true,
  }
}

const historyErrorRead = (
  asset: AssetListItem,
  sourceHistory: readonly SourceRevision[],
  outputHistory: RemoteAssetHistoryManifestEntry["outputHistory"],
): string | undefined => {
  const sourceIds = new Set<string>()
  const revisions = new Set<number>()
  for (const source of sourceHistory) {
    if (sourceIds.has(source.id)) return `The source history contained a duplicate revision id for asset ${asset.id}`
    if (revisions.has(source.revision))
      return `The source history contained a duplicate revision number for asset ${asset.id}`
    sourceIds.add(source.id)
    revisions.add(source.revision)
    if (source.assetId !== asset.id || source.class !== asset.class)
      return `The source history did not belong to asset ${asset.id}`
  }
  const orderedRevisions = [...revisions].sort((left, right) => left - right)
  if (orderedRevisions.some((revision, index) => revision !== index + 1))
    return `The source history was incomplete for asset ${asset.id}`
  const currentSources = sourceHistory.filter((source) => source.id === asset.currentSourceRevisionId)
  if (currentSources.length !== 1) return `The current source revision was not unique for asset ${asset.id}`
  if (currentSources[0]?.revision !== orderedRevisions.at(-1))
    return `The current source revision was not the latest revision for asset ${asset.id}`

  const definitionIds = new Set<string>()
  for (const history of outputHistory) {
    if (definitionIds.has(history.definition.id))
      return `The output history contained a duplicate definition for asset ${asset.id}`
    definitionIds.add(history.definition.id)
    if (history.definition.assetId !== asset.id || history.definition.kind !== asset.class)
      return `The output history did not belong to asset ${asset.id}`
    const versions = new Set<number>()
    let currentVersionCount = 0
    for (const version of history.versions) {
      if (versions.has(version.version)) return `The output history contained a duplicate version for asset ${asset.id}`
      versions.add(version.version)
      if (version.assetId !== asset.id || version.outputDefinitionId !== history.definition.id)
        return `The output history contained a version for the wrong asset ${asset.id}`
      if (version.sourceRevisionId !== null && !sourceIds.has(version.sourceRevisionId))
        return `The output history referenced an unknown source revision for asset ${asset.id}`
      if (!version.current) continue
      currentVersionCount += 1
      if (version.sourceRevisionId !== null && version.sourceRevisionId !== asset.currentSourceRevisionId)
        return `The current output did not reference the current source revision for asset ${asset.id}`
    }
    if (currentVersionCount > 1) return `The output history contained multiple current versions for asset ${asset.id}`
  }
  return undefined
}

export const remoteAssetHistoryManifestLoad = async (
  input: RemoteAssetHistoryManifestLoadInput,
): Promise<Result<RemoteAssetHistoryManifest>> => {
  const op = "remoteAssetHistoryManifestLoad"
  const assets = await input.client.assetsReadAll(input.projectId, { include: "history,metadata" })
  if (!assets.success) return assets
  const entries: RemoteAssetHistoryManifestEntry[] = []
  const eligibilityBySourceRevision = new Map<string, SourceRevisionDeletionEligibilityResponse>()
  for (const asset of assets.data) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (uuidPattern.test(asset.projectId) && uuidPattern.test(input.projectId) && asset.projectId !== input.projectId)
      return resultErrorCreate(op, `Asset history returned an asset from the wrong project: ${asset.id}`)
    if (asset.sourceHistory === undefined || asset.outputHistory === undefined)
      return resultErrorCreate(op, `History was not returned for asset ${asset.id}`)
    const entry = entryCreate(asset, asset.sourceHistory, asset.outputHistory)
    if (
      entry.valid &&
      input.environment !== undefined &&
      input.client.sourceRevisionDeletionEligibilityRead !== undefined
    ) {
      const existingEligibility = eligibilityBySourceRevision.get(entry.currentSourceRevisionId)
      if (existingEligibility !== undefined) {
        entry.deletionEligibility = existingEligibility
      } else {
        const eligibility = await input.client.sourceRevisionDeletionEligibilityRead(
          input.projectId,
          input.environment,
          entry.currentSourceRevisionId,
        )
        if (!eligibility.success) return eligibility
        if (eligibility.data.sourceRevisionId !== entry.currentSourceRevisionId)
          return resultErrorCreate(op, "The deletion eligibility revision did not match")
        eligibilityBySourceRevision.set(entry.currentSourceRevisionId, eligibility.data)
        entry.deletionEligibility = eligibility.data
      }
    }
    entries.push(entry)
  }
  entries.sort((left, right) => {
    const classOrder = nfcLexicalCompare(left.class, right.class)
    if (classOrder !== 0) return classOrder
    const logicalOrder = nfcLexicalCompare(left.logicalPath, right.logicalPath)
    if (logicalOrder !== 0) return logicalOrder
    const sourceOrder = nfcLexicalCompare(left.sourcePath, right.sourcePath)
    if (sourceOrder !== 0) return sourceOrder
    return nfcLexicalCompare(left.assetId, right.assetId)
  })
  return { success: true, data: { entries } }
}
