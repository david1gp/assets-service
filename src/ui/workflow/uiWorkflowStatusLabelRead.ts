import { ttc } from "../localization/ttc.js"

/** Localizes known workflow and job statuses while preserving unknown API values. */
export const uiWorkflowStatusLabelRead = (status: string): string => {
  if (status === "queued") return ttc("queued", "eingereiht")
  if (status === "running") return ttc("running", "läuft")
  if (status === "succeeded") return ttc("succeeded", "abgeschlossen")
  if (status === "completed") return ttc("completed", "abgeschlossen")
  if (status === "failed") return ttc("failed", "fehlgeschlagen")
  if (status === "retryable") return ttc("retryable", "wiederholbar")
  if (status === "dead") return ttc("dead", "endgültig fehlgeschlagen")
  if (status === "cancelled") return ttc("cancelled", "abgebrochen")
  return status
}
