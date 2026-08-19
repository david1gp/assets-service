import type { SourceRevisionDeletionEligibilityResponse } from "../api-client/sourceRevisionDeletionEligibilityResponseSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { LocalAssetManifestEntry } from "./localAssetManifestLoad.js"
import { nfcLexicalCompare } from "./nfcLexicalCompare.js"
import type { RemoteAssetHistoryManifestEntry } from "./remoteAssetHistoryManifestLoad.js"

export const assetDiffStatuses = [
  "new",
  "changed",
  "matching",
  "remote-only",
  "unsupported",
  "conflict",
  "metadata",
] as const

export type AssetDiffStatus = (typeof assetDiffStatuses)[number]

export type AssetDiffDeletionEligibility = {
  eligible: boolean
  sourceRevisionId?: string
  details?: SourceRevisionDeletionEligibilityResponse
}

export type AssetDiffEntry = {
  status: AssetDiffStatus
  class: AssetClass
  sourcePath: string
  logicalPath: string
  local?: LocalAssetManifestEntry
  remote?: RemoteAssetHistoryManifestEntry
  localAlt: string | null
  remoteAlt: string | null
  altChanged: boolean
  deletionEligible: boolean
  deletionEligibility: AssetDiffDeletionEligibility
  reason?: string
}

export type AssetDiff = {
  entries: readonly AssetDiffEntry[]
}

const deletionEligibilityCreate = (
  remote: RemoteAssetHistoryManifestEntry | undefined,
): AssetDiffDeletionEligibility => ({
  eligible: remote?.deletionEligibility?.eligible === true,
  ...(remote === undefined ? {} : { sourceRevisionId: remote.currentSourceRevisionId }),
  ...(remote?.deletionEligibility === null || remote === undefined ? {} : { details: remote.deletionEligibility }),
})

const altFieldsCreate = (
  local: LocalAssetManifestEntry | undefined,
  remote: RemoteAssetHistoryManifestEntry | undefined,
): Pick<AssetDiffEntry, "localAlt" | "remoteAlt" | "altChanged"> => {
  const localAlt = local?.alt ?? null
  const remoteAlt = remote?.alt ?? null
  const normalizedLocalAlt = (localAlt ?? "").trim()
  const normalizedRemoteAlt = (remoteAlt ?? "").trim()
  return {
    localAlt,
    remoteAlt,
    altChanged: normalizedLocalAlt !== normalizedRemoteAlt,
  }
}

const entrySort = (left: AssetDiffEntry, right: AssetDiffEntry): number => {
  const leftKey = `${left.class}\u0000${left.logicalPath.normalize("NFC")}`
  const rightKey = `${right.class}\u0000${right.logicalPath.normalize("NFC")}`
  const keyOrder = nfcLexicalCompare(leftKey, rightKey)
  if (keyOrder !== 0) return keyOrder
  return nfcLexicalCompare(left.sourcePath, right.sourcePath)
}

const remoteEntriesByKey = (entries: readonly RemoteAssetHistoryManifestEntry[]) => {
  const result = new Map<string, RemoteAssetHistoryManifestEntry[]>()
  for (const entry of entries) {
    const values = result.get(entry.keys.logicalKey) ?? []
    values.push(entry)
    result.set(entry.keys.logicalKey, values)
  }
  return result
}

const remoteEntriesByTargetKey = (entries: readonly RemoteAssetHistoryManifestEntry[]) => {
  const result = new Map<string, RemoteAssetHistoryManifestEntry[]>()
  for (const entry of entries) {
    const values = result.get(entry.keys.targetKey) ?? []
    values.push(entry)
    result.set(entry.keys.targetKey, values)
  }
  return result
}

const remoteEntriesByIdentity = (entries: readonly RemoteAssetHistoryManifestEntry[]) => {
  const result = new Map<string, RemoteAssetHistoryManifestEntry[]>()
  for (const entry of entries) {
    const key = JSON.stringify([entry.class, entry.logicalPath.normalize("NFC")])
    const values = result.get(key) ?? []
    values.push(entry)
    result.set(key, values)
  }
  return result
}

const remoteEntriesBySourcePath = (entries: readonly RemoteAssetHistoryManifestEntry[]) => {
  const result = new Map<string, RemoteAssetHistoryManifestEntry[]>()
  for (const entry of entries) {
    const key = JSON.stringify([entry.class, entry.sourcePath.normalize("NFC")])
    const values = result.get(key) ?? []
    values.push(entry)
    result.set(key, values)
  }
  return result
}

export const assetDiffClassify = (input: {
  local: readonly LocalAssetManifestEntry[]
  remote: readonly RemoteAssetHistoryManifestEntry[]
}): Result<AssetDiff> => {
  const remoteByLogicalKey = remoteEntriesByKey(input.remote)
  const remoteByTargetKey = remoteEntriesByTargetKey(input.remote)
  const remoteByIdentity = remoteEntriesByIdentity(input.remote)
  const remoteBySourcePath = remoteEntriesBySourcePath(input.remote)
  const remoteConflicts = new Set<RemoteAssetHistoryManifestEntry>()
  for (const group of [...remoteByIdentity.values(), ...remoteBySourcePath.values()]) {
    if (group.length < 2) continue
    for (const remote of group) remoteConflicts.add(remote)
  }
  const localKeys = new Set<string>()
  const localTargetKeys = new Set<string>()
  const consumedRemote = new Set<RemoteAssetHistoryManifestEntry>()
  const entries: AssetDiffEntry[] = []

  for (const local of input.local) {
    const mapping = local.mapping
    const logicalPath = mapping?.logicalPath ?? local.file.sourcePath
    const assetClass = mapping?.class ?? local.file.class
    const localKey = mapping?.keys.logicalKey
    if (localKey !== undefined) localKeys.add(localKey)
    if (mapping?.keys.targetKey !== undefined) localTargetKeys.add(mapping.keys.targetKey)
    if (local.status === "unsupported") {
      entries.push({
        status: "unsupported",
        class: assetClass,
        sourcePath: local.file.sourcePath,
        logicalPath,
        local,
        ...altFieldsCreate(local, undefined),
        deletionEligible: false,
        deletionEligibility: { eligible: false },
        ...(local.errorMessage === undefined ? {} : { reason: local.errorMessage }),
      })
      continue
    }
    if (
      local.status === "conflict" ||
      mapping === undefined ||
      local.fingerprint === undefined ||
      localKey === undefined
    ) {
      entries.push({
        status: "conflict",
        class: assetClass,
        sourcePath: local.file.sourcePath,
        logicalPath,
        local,
        ...altFieldsCreate(local, undefined),
        deletionEligible: false,
        deletionEligibility: { eligible: false },
        reason: local.errorMessage ?? "The local asset could not be preflighted",
      })
      continue
    }
    const remoteTargetMatches = remoteByTargetKey.get(mapping.keys.targetKey) ?? []
    const remoteMatches = remoteByLogicalKey.get(localKey) ?? []
    const remote = remoteMatches[0]
    if (
      remoteTargetMatches.length > 1 ||
      remoteTargetMatches.some((candidate) => candidate.keys.logicalKey !== localKey) ||
      remoteMatches.some((candidate) => !candidate.valid) ||
      remoteMatches.some((candidate) => remoteConflicts.has(candidate))
    ) {
      for (const candidate of remoteTargetMatches) consumedRemote.add(candidate)
      entries.push({
        status: "conflict",
        class: assetClass,
        sourcePath: local.file.sourcePath,
        logicalPath,
        local,
        ...(remote === undefined ? {} : { remote }),
        ...altFieldsCreate(local, remote),
        deletionEligible: false,
        deletionEligibility: { eligible: false },
        reason: "The remote manifest contains conflicting entries for this asset",
      })
      continue
    }
    if (remote === undefined) {
      entries.push({
        status: "new",
        class: assetClass,
        sourcePath: local.file.sourcePath,
        logicalPath,
        local,
        ...altFieldsCreate(local, undefined),
        deletionEligible: false,
        deletionEligibility: { eligible: false },
      })
      continue
    }
    consumedRemote.add(remote)
    const bytesMatching =
      remote.class === assetClass &&
      remote.logicalPath.normalize("NFC") === mapping.logicalPath.normalize("NFC") &&
      remote.byteSize === local.fingerprint.byteSize &&
      remote.sha256 === local.fingerprint.sha256 &&
      remote.mediaType.trim().toLowerCase() === local.fingerprint.mediaType
    const altFields = altFieldsCreate(local, remote)
    const matching = bytesMatching && !altFields.altChanged
    const status = matching ? "matching" : bytesMatching ? "metadata" : "changed"
    const deletionEligibility = deletionEligibilityCreate(remote)
    entries.push({
      status,
      class: assetClass,
      sourcePath: local.file.sourcePath,
      logicalPath,
      local,
      remote,
      ...altFields,
      deletionEligible: matching && deletionEligibility.eligible,
      deletionEligibility,
      ...(matching
        ? {}
        : {
            reason: bytesMatching
              ? "The local sidecar alt differs from remote metadata"
              : "The source fingerprint differs",
          }),
    })
  }

  for (const remote of input.remote) {
    if (consumedRemote.has(remote)) continue
    if (remoteConflicts.has(remote)) {
      entries.push({
        status: "conflict",
        class: remote.class,
        sourcePath: remote.sourcePath,
        logicalPath: remote.logicalPath,
        remote,
        ...altFieldsCreate(undefined, remote),
        deletionEligible: false,
        deletionEligibility: deletionEligibilityCreate(remote),
        reason: "The remote manifest contains duplicate normalized asset identities",
      })
      continue
    }
    if (localKeys.has(remote.keys.logicalKey)) continue
    const targetMatches = remoteByTargetKey.get(remote.keys.targetKey) ?? []
    if (localTargetKeys.has(remote.keys.targetKey) || targetMatches.length > 1) {
      for (const candidate of targetMatches) consumedRemote.add(candidate)
      entries.push({
        status: "conflict",
        class: remote.class,
        sourcePath: remote.sourcePath,
        logicalPath: remote.logicalPath,
        remote,
        ...altFieldsCreate(undefined, remote),
        deletionEligible: false,
        deletionEligibility: deletionEligibilityCreate(remote),
        reason: "The remote manifest contains conflicting asset targets",
      })
      continue
    }
    entries.push({
      status: remote.valid ? "remote-only" : "conflict",
      class: remote.class,
      sourcePath: remote.sourcePath,
      logicalPath: remote.logicalPath,
      remote,
      ...altFieldsCreate(undefined, remote),
      deletionEligible: false,
      deletionEligibility: deletionEligibilityCreate(remote),
      ...(remote.valid ? {} : { reason: remote.errorMessage ?? "The remote manifest entry was invalid" }),
    })
  }

  entries.sort(entrySort)
  return { success: true, data: { entries } }
}
