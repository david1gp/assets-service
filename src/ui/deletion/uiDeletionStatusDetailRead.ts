import type { DeletionState } from "../../deletion/deletionStateSchema.js"
import { ttc } from "../localization/ttc.js"

/** One-line summary of when a deletion was requested or finished. */
export const uiDeletionStatusDetailRead = (state: DeletionState): string => {
  if (state.status === "succeeded" && state.completedAt !== undefined)
    return `${ttc("completed", "abgeschlossen")} ${state.completedAt.slice(0, 16).replace("T", " ")} UTC`
  return `${ttc("requested", "angefordert")} ${state.requestedAt.slice(0, 16).replace("T", " ")} UTC`
}
