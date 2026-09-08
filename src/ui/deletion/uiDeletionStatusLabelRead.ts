import type { DeletionState } from "../../deletion/deletionStateSchema.js"
import { ttc } from "../localization/ttc.js"

/**
 * Names a deletion state for readers. `requested` and `in_progress` must not
 * read as finished, because the objects and catalog entries still exist.
 */
export const uiDeletionStatusLabelRead = (status: DeletionState["status"]): string => {
  if (status === "requested") return ttc("Deletion requested", "Löschung angefordert")
  if (status === "in_progress") return ttc("Deletion running", "Löschung läuft")
  if (status === "succeeded") return ttc("Deleted", "Gelöscht")
  if (status === "retryable") return ttc("Deletion retrying", "Löschung wird erneut versucht")
  return ttc("Deletion failed", "Löschung fehlgeschlagen")
}
