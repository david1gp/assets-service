import * as v from "valibot"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { cloudflareRequestCredentialsSchema } from "./cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "./cloudflareSecretRedact.js"

const defaultApiBaseUrl = "https://api.cloudflare.com/client/v4/"

export const cloudflareApiRequest = async (input: {
  accountId: string
  apiToken: string
  method: "DELETE" | "GET" | "POST"
  path: string
  body?: unknown
  apiBaseUrl?: string
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): Promise<Result<{ status: number; body: unknown }>> => {
  const op = "cloudflareApiRequest"
  const credentials = v.safeParse(cloudflareRequestCredentialsSchema, {
    accountId: input.accountId,
    apiToken: input.apiToken,
  })
  if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")

  let url: string
  try {
    const baseUrl = input.apiBaseUrl ?? defaultApiBaseUrl
    url = new URL(input.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
  } catch {
    return resultErrorCreate(op, "The Cloudflare API request URL was invalid")
  }

  const fetcher = input.fetchImplementation ?? fetch
  let response: Response
  try {
    response = await fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${credentials.output.apiToken}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    })
  } catch (error) {
    return resultErrorCreate(op, "The Cloudflare API request could not be completed", undefined, {
      diagnostics: {
        cause: cloudflareSecretRedact(error instanceof Error ? error.message : String(error), [input.apiToken]),
      },
    })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    if (response.status === 204) return { success: true, data: { status: response.status, body: undefined } }
    if (!response.ok)
      return resultErrorCreate(op, `The Cloudflare API request failed with status ${response.status}`, undefined, {
        diagnostics: { status: response.status },
      })
    return resultErrorCreate(op, "The Cloudflare API response was not valid JSON", undefined, {
      diagnostics: { status: response.status },
    })
  }

  if (!response.ok)
    return resultErrorCreate(op, `The Cloudflare API request failed with status ${response.status}`, undefined, {
      diagnostics: {
        status: response.status,
        response: cloudflareSecretRedact(JSON.stringify(body), [input.apiToken]),
      },
    })
  return { success: true, data: { status: response.status, body } }
}
