import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { canonicalJsonDigest } from "./canonicalJsonDigest.js"
import { catalogEntriesCanonicalize } from "./catalogEntriesCanonicalize.js"

export const catalogDigestCreate = (entries: readonly unknown[]): Result<string> => {
  const op = "catalogDigestCreate"
  const canonical = catalogEntriesCanonicalize(entries)
  if (!canonical.success) return resultErrorCreate(op, canonical.errorMessage, canonical.rawData)
  return { success: true, data: canonicalJsonDigest(canonical.data) }
}
