import type { Sha256 } from "../schemas/sha256Schema.js"
import type { OutputVersionDecision } from "./outputVersionDecisionSchema.js"

type ExistingOutputVersion = {
  version: number
  byteSize: number
  sha256: Sha256
  sourceRevisionId?: string | null
}

export const outputVersionDecisionCreate = (
  existingVersions: readonly ExistingOutputVersion[],
  byteSize: number,
  sha256: Sha256,
  forceNewVersion = false,
  sourceRevisionId?: string,
): OutputVersionDecision => {
  if (forceNewVersion) {
    const highestVersion = existingVersions.reduce((highest, version) => Math.max(highest, version.version), 0)
    return { kind: "allocate", version: highestVersion + 1 }
  }
  const matchingChecksums = existingVersions.filter(
    (version) =>
      version.sha256 === sha256 && (sourceRevisionId === undefined || version.sourceRevisionId === sourceRevisionId),
  )
  const mismatchedChecksum = matchingChecksums
    .filter((version) => version.byteSize !== byteSize)
    .toSorted((left, right) => left.version - right.version)[0]
  if (mismatchedChecksum !== undefined) return { kind: "collision", version: mismatchedChecksum.version }
  const matchingChecksum = matchingChecksums.toSorted((left, right) => left.version - right.version)[0]
  if (matchingChecksum !== undefined) {
    return { kind: "reuse", version: matchingChecksum.version }
  }

  const highestVersion = existingVersions.reduce((highest, version) => Math.max(highest, version.version), 0)
  return { kind: "allocate", version: highestVersion + 1 }
}
