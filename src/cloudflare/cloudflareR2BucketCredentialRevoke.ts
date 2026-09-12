import * as v from "valibot"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { cloudflareApiRequest } from "./cloudflareApiRequest.js"
import { cloudflareRequestCredentialsSchema } from "./cloudflareRequestCredentialsSchema.js"

export const cloudflareR2BucketCredentialRevoke = async (input: {
  accountId: string
  apiToken: string
  revocationId: string
  apiBaseUrl?: string
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): Promise<Result<boolean>> => {
  const op = "cloudflareR2BucketCredentialRevoke"
  const credentials = v.safeParse(cloudflareRequestCredentialsSchema, {
    accountId: input.accountId,
    apiToken: input.apiToken,
  })
  if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")
  if (typeof input.revocationId !== "string" || input.revocationId.length === 0)
    return resultErrorCreate(op, "The Cloudflare R2 credential revocation identifier is required")

  const request = await cloudflareApiRequest({
    accountId: credentials.output.accountId,
    apiToken: credentials.output.apiToken,
    method: "DELETE",
    path: `accounts/${encodeURIComponent(credentials.output.accountId)}/tokens/${encodeURIComponent(input.revocationId)}`,
    ...(input.apiBaseUrl === undefined ? {} : { apiBaseUrl: input.apiBaseUrl }),
    ...(input.fetchImplementation === undefined ? {} : { fetchImplementation: input.fetchImplementation }),
  })
  if (!request.success) {
    if (request.diagnostics !== null && typeof request.diagnostics === "object" && "status" in request.diagnostics) {
      const status = request.diagnostics.status
      if (status === 404) return { success: true, data: false }
    }
    return { ...request, op }
  }

  if (request.data.status === 204) return { success: true, data: true }
  const parsed = v.safeParse(v.object({ success: v.literal(true) }), request.data.body)
  if (!parsed.success) return resultErrorCreate(op, "The Cloudflare R2 credential revoke response was invalid")
  return { success: true, data: true }
}
