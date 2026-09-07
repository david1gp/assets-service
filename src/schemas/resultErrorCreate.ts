import type { Result } from "./resultSchema.js"

export const resultErrorCreate = (
  op: string,
  errorMessage: string,
  rawData?: unknown,
  options: { diagnostics?: unknown; retryable?: boolean } = {},
): Result<never> => ({
  success: false,
  op,
  errorMessage,
  ...(rawData === undefined ? {} : { rawData }),
  ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
  ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
})
