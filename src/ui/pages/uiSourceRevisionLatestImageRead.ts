import { sourceRevisionPreviewMediaTypeCheck } from "../../upload/sourceRevisionPreviewMediaTypeCheck.js"
import type { SourceRevision } from "../../upload/sourceRevisionSchema.js"

/** Reads the highest-numbered source revision when that latest revision is an image. */
export const uiSourceRevisionLatestImageRead = <T extends Pick<SourceRevision, "mediaType" | "revision">>(
  revisions: readonly T[],
): T | null => {
  const latest = revisions.reduce<T | null>(
    (candidate, revision) => (candidate === null || revision.revision > candidate.revision ? revision : candidate),
    null,
  )
  if (latest === null || !sourceRevisionPreviewMediaTypeCheck(latest.mediaType)) return null
  return latest
}
