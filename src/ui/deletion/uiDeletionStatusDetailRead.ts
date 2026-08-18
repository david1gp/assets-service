import type { DeletionState } from "../../deletion/deletionStateSchema.js"

/** One-line summary of when a deletion was requested or finished. */
export const uiDeletionStatusDetailRead = (state: DeletionState): string => {
  if (state.status === "succeeded" && state.completedAt !== undefined)
    return `completed ${state.completedAt.slice(0, 16).replace("T", " ")} UTC`
  return `requested ${state.requestedAt.slice(0, 16).replace("T", " ")} UTC`
}
