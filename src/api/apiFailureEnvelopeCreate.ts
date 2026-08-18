import type { StructuredError } from "./structuredErrorSchema.js"

export const apiFailureEnvelopeCreate = (error: StructuredError, requestId?: string) => ({
  ok: false as const,
  error,
  ...(requestId === undefined ? {} : { requestId }),
})
