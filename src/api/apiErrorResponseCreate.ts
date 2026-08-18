import { apiFailureEnvelopeCreate } from "./apiFailureEnvelopeCreate.js"
import { apiResponseCreate } from "./apiResponseCreate.js"
import type { ErrorCode } from "./errorCodeSchema.js"

type ApiHeaders = Record<string, string> | Headers
type ApiErrorResponseOptions = {
  requestId: string
  status: number
  code: ErrorCode
  message: string
  retryable?: boolean
  details?: Record<string, unknown>
  headers?: ApiHeaders
}

export const apiErrorResponseCreate = (options: ApiErrorResponseOptions): Response =>
  apiResponseCreate(
    apiFailureEnvelopeCreate(
      {
        code: options.code,
        message: options.message,
        ...(options.details === undefined ? {} : { details: options.details }),
        retryable: options.retryable ?? false,
      },
      options.requestId,
    ),
    options,
  )
