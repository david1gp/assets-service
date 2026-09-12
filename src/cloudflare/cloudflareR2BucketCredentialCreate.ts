import * as v from "valibot"
import type { R2BucketCredentialCreateInput } from "../r2/r2BucketCredentialCreateInputSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { cloudflareApiRequest } from "./cloudflareApiRequest.js"
import { cloudflareRequestCredentialsSchema } from "./cloudflareRequestCredentialsSchema.js"

const r2PermissionGroupId = "2efd5506f9c8494dacb1fa10a3e7d5b6"
const r2PermissionGroupName = "Workers R2 Storage Bucket Item Write"

export const cloudflareR2BucketCredentialCreate = async (input: {
  accountId: string
  apiToken: string
  bucket: string
  name?: string
  apiBaseUrl?: string
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): Promise<Result<R2BucketCredentialCreateInput>> => {
  const op = "cloudflareR2BucketCredentialCreate"
  const credentials = v.safeParse(cloudflareRequestCredentialsSchema, {
    accountId: input.accountId,
    apiToken: input.apiToken,
  })
  if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")
  if (typeof input.bucket !== "string" || input.bucket.length === 0)
    return resultErrorCreate(op, "The R2 bucket is required")

  const resource = `com.cloudflare.edge.r2.bucket.${credentials.output.accountId}_default_${input.bucket}`
  const request = await cloudflareApiRequest({
    accountId: credentials.output.accountId,
    apiToken: credentials.output.apiToken,
    method: "POST",
    path: `accounts/${encodeURIComponent(credentials.output.accountId)}/tokens`,
    body: {
      name: input.name ?? `assets-service-${input.bucket}`,
      policies: [
        {
          effect: "allow",
          resources: { [resource]: "*" },
          permission_groups: [{ id: r2PermissionGroupId, name: r2PermissionGroupName }],
        },
      ],
    },
    ...(input.apiBaseUrl === undefined ? {} : { apiBaseUrl: input.apiBaseUrl }),
    ...(input.fetchImplementation === undefined ? {} : { fetchImplementation: input.fetchImplementation }),
  })
  if (!request.success) return { ...request, op }

  const parsed = v.safeParse(
    v.object({
      success: v.literal(true),
      result: v.object({
        id: v.pipe(v.string(), v.minLength(1)),
        value: v.pipe(v.string(), v.minLength(1)),
      }),
    }),
    request.data.body,
  )
  if (!parsed.success) return resultErrorCreate(op, "The Cloudflare R2 credential response was invalid")

  // Cloudflare maps an account API token's id to the S3 access key and the lowercase SHA-256 hex digest of its
  // value to the S3 secret (https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token).
  // The one-time raw value is used only in memory and is never persisted or logged.
  let digest: ArrayBuffer
  try {
    digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.output.result.value))
  } catch {
    return resultErrorCreate(op, "The Cloudflare R2 credential secret could not be derived")
  }
  const secretAccessKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")

  return {
    success: true,
    data: {
      bucket: input.bucket,
      accessKeyId: parsed.output.result.id,
      secretAccessKey,
      revocationId: parsed.output.result.id,
    },
  }
}
