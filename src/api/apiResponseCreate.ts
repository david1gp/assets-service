import type { JsonEnvelope } from "./jsonEnvelopeSchema.js"
import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"

type ApiHeaders = Record<string, string> | Headers
type ApiResponseOptions = {
  status: number
  requestId: string
  headers?: ApiHeaders
}

export const apiResponseCreate = (envelope: JsonEnvelope, options: ApiResponseOptions): Response => {
  const headers = new Headers(options.headers)
  headers.set("content-type", "application/json; charset=UTF-8")
  headers.set("x-request-id", options.requestId)
  return new Response(`${canonicalJsonStringify(envelope)}\n`, { status: options.status, headers })
}
