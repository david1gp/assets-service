import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { ttc } from "../localization/ttc.js"

/** Computes the hexadecimal SHA-256 digest of the given file bytes. */
export const uiUploadSha256Read = async (bytes: Uint8Array): Promise<Result<string>> => {
  if (!globalThis.crypto?.subtle)
    return resultErrorCreate(
      "uiUploadSha256Read",
      ttc("This browser cannot compute upload checksums", "Dieser Browser kann keine Upload-Prüfsummen berechnen"),
    )
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    return { success: true, data: hex }
  } catch {
    return resultErrorCreate(
      "uiUploadSha256Read",
      ttc("The upload checksum could not be computed", "Die Upload-Prüfsumme konnte nicht berechnet werden"),
    )
  }
}
