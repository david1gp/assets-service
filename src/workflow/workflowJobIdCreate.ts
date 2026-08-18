import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"

const idMaxLength = 128
const digestLength = 32

/**
 * Builds a job or dependency identifier below the 128 character identifier
 * limit. Long workflow identifiers are already digests, so a suffix such as an
 * output definition id can push the plain concatenation over the limit; in that
 * case the whole pair is hashed and kept unique.
 */
export const workflowJobIdCreate = (workflowId: string, suffix: string): string => {
  const plain = `${workflowId}-${suffix}`
  if (plain.length <= idMaxLength) return plain
  const digest = canonicalJsonDigest({ workflowId, suffix }).slice(0, digestLength)
  return `${workflowId.slice(0, idMaxLength - digestLength - 1)}-${digest}`
}
