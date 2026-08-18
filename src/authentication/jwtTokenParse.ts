import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const base64UrlDecode = (value: string): Result<Uint8Array> => {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return resultErrorCreate("jwtTokenParse", "The JWT contained invalid base64url data")
  }
  try {
    const decoded = new Uint8Array(Buffer.from(value, "base64url"))
    if (Buffer.from(decoded).toString("base64url") !== value)
      return resultErrorCreate("jwtTokenParse", "The JWT contained non-canonical base64url data")
    return { success: true, data: decoded }
  } catch (error) {
    return resultErrorCreate("jwtTokenParse", "The JWT contained invalid base64url data", error)
  }
}

const jsonObjectRead = (value: Uint8Array): Result<Record<string, unknown>> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(value))
  } catch (error) {
    return resultErrorCreate("jwtTokenParse", "The JWT contained invalid JSON", error)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return resultErrorCreate("jwtTokenParse", "The JWT JSON value was not an object")
  }
  return { success: true, data: parsed as Record<string, unknown> }
}

export const jwtTokenParse = async (
  token: string,
): Promise<
  Result<{
    header: { alg: string; kid: string }
    payload: Record<string, unknown>
    signingInput: string
    signature: Uint8Array
  }>
> => {
  const op = "jwtTokenParse"
  const parts = token.split(".")
  if (parts.length !== 3) return resultErrorCreate(op, "The bearer token was not a compact JWT")
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  if (!encodedHeader || !encodedPayload || !encodedSignature) return resultErrorCreate(op, "The JWT was incomplete")

  const headerBytes = base64UrlDecode(encodedHeader)
  if (!headerBytes.success) return headerBytes
  const payloadBytes = base64UrlDecode(encodedPayload)
  if (!payloadBytes.success) return payloadBytes
  const signature = base64UrlDecode(encodedSignature)
  if (!signature.success) return signature
  const header = jsonObjectRead(headerBytes.data)
  if (!header.success) return header
  const payload = jsonObjectRead(payloadBytes.data)
  if (!payload.success) return payload
  if (typeof header.data.alg !== "string" || typeof header.data.kid !== "string") {
    return resultErrorCreate(op, "The JWT header did not contain an algorithm and key id")
  }

  return {
    success: true,
    data: {
      header: { alg: header.data.alg, kid: header.data.kid },
      payload: payload.data,
      signingInput: `${encodedHeader}.${encodedPayload}`,
      signature: signature.data,
    },
  }
}
