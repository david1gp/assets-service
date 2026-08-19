import type { ProjectSourceConfiguration } from "../config/projectSourceConfigurationSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { UploadSupportedMediaType } from "../upload/uploadSupportedMediaTypes.js"
import { assetSourceMediaTypeRead } from "./assetSourceMediaTypeRead.js"
import { type AssetSourcePathMapping, assetSourcePathMap } from "./assetSourcePathMap.js"
import type { ConfiguredRootScan, ConfiguredRootScanFile } from "./configuredRootScan.js"
import { nfcLexicalCompare } from "./nfcLexicalCompare.js"

export type AssetSourcePreflightStatus = "valid" | "unsupported" | "conflict"

export type AssetSourcePreflightEntry = {
  file: ConfiguredRootScanFile
  mapping?: AssetSourcePathMapping
  mediaType?: UploadSupportedMediaType
  status: AssetSourcePreflightStatus
  errorMessage?: string
}

export type AssetSourcePreflight = {
  root: string
  entries: readonly AssetSourcePreflightEntry[]
}

export const assetSourcePreflight = (
  scan: ConfiguredRootScan,
  sourceDirectories: ProjectSourceConfiguration,
): Result<AssetSourcePreflight> => {
  const entries: AssetSourcePreflightEntry[] = []
  for (const file of scan.files) {
    if (file.sourcePath.toLowerCase().endsWith(".md")) continue
    if (file.class === "image" && file.sourcePath.toLowerCase().endsWith(".txt")) continue
    const classRoot = sourceDirectories[file.class]
    if (classRoot === null) {
      entries.push({ file, status: "conflict", errorMessage: "The asset class was disabled after scanning" })
      continue
    }
    const mapping = assetSourcePathMap({ root: scan.root, classRoot, file })
    if (!mapping.success) {
      entries.push({ file, status: "conflict", errorMessage: mapping.errorMessage })
      continue
    }
    const mediaType = assetSourceMediaTypeRead(mapping.data.class, mapping.data.filename)
    if (!mediaType.success) {
      entries.push({ file, mapping: mapping.data, status: "unsupported", errorMessage: mediaType.errorMessage })
      continue
    }
    entries.push({ file, mapping: mapping.data, mediaType: mediaType.data, status: "valid" })
  }

  const targetEntries = new Map<string, AssetSourcePreflightEntry[]>()
  for (const entry of entries) {
    if (entry.mapping === undefined) continue
    const key = entry.mapping.keys.targetKey
    const existing = targetEntries.get(key) ?? []
    existing.push(entry)
    targetEntries.set(key, existing)
  }
  for (const duplicates of targetEntries.values()) {
    if (duplicates.length < 2) continue
    for (const entry of duplicates) {
      entry.status = "conflict"
      entry.errorMessage = "Multiple local files target the same normalized asset"
    }
  }

  entries.sort((left, right) => {
    const leftKey = left.mapping?.keys.logicalKey ?? JSON.stringify([left.file.class, left.file.sourcePath])
    const rightKey = right.mapping?.keys.logicalKey ?? JSON.stringify([right.file.class, right.file.sourcePath])
    const keyOrder = nfcLexicalCompare(leftKey, rightKey)
    if (keyOrder !== 0) return keyOrder
    return nfcLexicalCompare(left.file.sourcePath, right.file.sourcePath)
  })
  return { success: true, data: { root: scan.root, entries } }
}
