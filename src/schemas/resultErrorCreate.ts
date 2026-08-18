import type { Result } from "./resultSchema.js"

export const resultErrorCreate = (
  op: string,
  errorMessage: string,
  rawData?: unknown,
  options: { retryable?: boolean } = {},
): Result<never> => ({
  success: false,
  op,
  errorMessage,
  ...(rawData === undefined ? {} : { rawData }),
  ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
})
