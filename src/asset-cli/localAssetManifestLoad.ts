import type { ProjectSourceConfiguration } from "../config/projectSourceConfigurationSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import { type AssetFileFingerprint, assetFileFingerprint } from "./assetFileFingerprint.js"
import { type AssetSourcePreflightEntry, assetSourcePreflight } from "./assetSourcePreflight.js"
import { configuredRootScan } from "./configuredRootScan.js"
import { imageSidecarAltRead } from "./imageSidecarAltRead.js"

export type LocalAssetManifestEntry = AssetSourcePreflightEntry & {
  alt: string | null
  fingerprint?: AssetFileFingerprint
}

export type LocalAssetManifest = {
  root: string
  entries: readonly LocalAssetManifestEntry[]
}

export const localAssetManifestLoad = async (
  root: string,
  sourceDirectories: ProjectSourceConfiguration,
): Promise<Result<LocalAssetManifest>> => {
  const scanned = await configuredRootScan(root, sourceDirectories)
  if (!scanned.success) return scanned
  const preflight = assetSourcePreflight(scanned.data, sourceDirectories)
  if (!preflight.success) return preflight
  const entries: LocalAssetManifestEntry[] = []
  for (const entry of preflight.data.entries) {
    let alt: string | null = null
    if (entry.file.class === "image") {
      const sidecar = await imageSidecarAltRead(entry.file.filePath)
      if (!sidecar.success) return sidecar
      alt = sidecar.data.alt
    }
    if (entry.status !== "valid" || entry.mapping === undefined || entry.mediaType === undefined) {
      entries.push({ ...entry, alt })
      continue
    }
    const fingerprint = await assetFileFingerprint(entry.mapping, entry.mediaType)
    if (!fingerprint.success) return fingerprint
    entries.push({ ...entry, alt, fingerprint: fingerprint.data })
  }
  return { success: true, data: { root: scanned.data.root, entries } }
}
