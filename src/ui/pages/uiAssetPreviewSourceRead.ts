import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import { sourceRevisionPreviewMediaTypeCheck } from "../../upload/sourceRevisionPreviewMediaTypeCheck.js"
import { uiSourceRevisionLatestImageRead } from "./uiSourceRevisionLatestImageRead.js"

type UiAssetPreviewSourceOptions = {
  outputVersionUrlCreate: (outputVersionId: string) => string
  sourceRevisionPreviewUrlCreate: (sourceRevisionId: string) => string
}

type UiAssetPreviewCandidate = {
  definitionId: string
  definitionKey: string
  height: number
  versionId: string
  versionNumber: number
  width: number
}

const stringCompare = (first: string, second: string): number => {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

const assetPreviewAltRead = (asset: AssetListItem): string => {
  const metadata = asset.metadata?.metadata
  if (metadata?.kind === "image" && metadata.alt) return metadata.alt
  return `Preview of ${asset.filename}`
}

const assetPreviewCandidateCompare = (first: UiAssetPreviewCandidate, second: UiAssetPreviewCandidate): number => {
  const areaDifference = first.width * first.height - second.width * second.height
  if (areaDifference !== 0) return areaDifference
  const widthDifference = first.width - second.width
  if (widthDifference !== 0) return widthDifference
  const heightDifference = first.height - second.height
  if (heightDifference !== 0) return heightDifference
  const keyDifference = stringCompare(first.definitionKey, second.definitionKey)
  if (keyDifference !== 0) return keyDifference
  const definitionDifference = stringCompare(first.definitionId, second.definitionId)
  if (definitionDifference !== 0) return definitionDifference
  const versionDifference = second.versionNumber - first.versionNumber
  if (versionDifference !== 0) return versionDifference
  return stringCompare(first.versionId, second.versionId)
}

const assetPreviewCandidatesRead = (asset: AssetListItem): UiAssetPreviewCandidate[] => {
  const candidates: UiAssetPreviewCandidate[] = []
  for (const history of asset.outputHistory ?? []) {
    if (history.definition.kind !== "image") continue
    for (const version of history.versions) {
      if (!version.current || !sourceRevisionPreviewMediaTypeCheck(version.mediaType)) continue
      candidates.push({
        definitionId: history.definition.id,
        definitionKey: history.definition.key,
        height: history.definition.height,
        versionId: version.id,
        versionNumber: version.version,
        width: history.definition.width,
      })
    }
  }
  return candidates
}

/** Selects the smallest current optimized image output, falling back to the latest original image. */
export const uiAssetPreviewSourceRead = (asset: AssetListItem, options: UiAssetPreviewSourceOptions) => {
  if (asset.class !== "image") return null
  const alt = assetPreviewAltRead(asset)
  const candidate = assetPreviewCandidatesRead(asset).sort(assetPreviewCandidateCompare)[0]
  if (candidate !== undefined) {
    return {
      alt,
      height: candidate.height,
      kind: "optimized" as const,
      url: options.outputVersionUrlCreate(candidate.versionId),
      width: candidate.width,
    }
  }

  const sourceRevision = uiSourceRevisionLatestImageRead(asset.sourceHistory ?? [])
  if (sourceRevision === null) return null
  return {
    alt,
    kind: "original" as const,
    url: options.sourceRevisionPreviewUrlCreate(sourceRevision.id),
  }
}
