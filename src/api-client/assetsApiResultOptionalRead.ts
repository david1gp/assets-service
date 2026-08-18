import type { Result } from "../schemas/resultSchema.js"

const notFoundCheck = (rawData: unknown): boolean => {
  if (!rawData || typeof rawData !== "object") return false
  const record = rawData as { status?: unknown; error?: unknown }
  if (record.status === 404) return true
  const error = record.error
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "not_found"
}

/**
 * Turns an expected absence into `null` instead of an error. A project without
 * a production catalog, or an asset that was never asked to be deleted, are
 * normal states, so callers should not render a failure for them.
 */
export const assetsApiResultOptionalRead = <T>(result: Result<T>): Result<T | null> => {
  if (result.success) return result
  if (notFoundCheck(result.rawData)) return { success: true, data: null }
  return result
}
