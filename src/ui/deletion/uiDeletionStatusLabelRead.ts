import type { DeletionState } from "../../deletion/deletionStateSchema.js"

const labels: Readonly<Record<DeletionState["status"], string>> = {
  requested: "Deletion requested",
  in_progress: "Deletion running",
  succeeded: "Deleted",
  retryable: "Deletion retrying",
  failed: "Deletion failed",
}

/**
 * Names a deletion state for readers. `requested` and `in_progress` must not
 * read as finished, because the objects and catalog entries still exist.
 */
export const uiDeletionStatusLabelRead = (status: DeletionState["status"]): string => labels[status]
