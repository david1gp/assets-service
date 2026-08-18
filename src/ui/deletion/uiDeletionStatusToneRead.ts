import type { DeletionState } from "../../deletion/deletionStateSchema.js"
import type { UiStatusTone } from "../common/uiStatusToneClassesRead.js"

/** Maps a deletion state to a badge tone; pending states stay neutral. */
export const uiDeletionStatusToneRead = (status: DeletionState["status"]): UiStatusTone => {
  if (status === "succeeded") return "positive"
  if (status === "failed") return "negative"
  return "neutral"
}
