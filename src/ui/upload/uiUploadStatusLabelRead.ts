import { ttc } from "../localization/ttc.js"

/** Localizes the known upload statuses while preserving unknown API values. */
export const uiUploadStatusLabelRead = (status: string): string => {
  if (status === "pending") return ttc("pending", "ausstehend")
  if (status === "verified") return ttc("verified", "verifiziert")
  if (status === "accepted") return ttc("accepted", "angenommen")
  if (status === "failed") return ttc("failed", "fehlgeschlagen")
  if (status === "cancelled") return ttc("cancelled", "abgebrochen")
  return status
}
