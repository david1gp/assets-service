import * as v from "valibot"
import { outputObjectKeySchema } from "../../output/outputObjectKeySchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { CustomDomainProbeResult } from "./customDomainProbeResult.js"

export const customDomainProbe = async (input: {
  baseUrl: string
  key?: string
  expectedCacheControl?: string
  expectedMediaType?: string
  expectedEtag?: string
  fetchImplementation?: CustomDomainFetch
}): Promise<Result<CustomDomainProbeResult>> => {
  const op = "customDomainProbe"
  try {
    const parsedKey = input.key === undefined ? undefined : v.safeParse(outputObjectKeySchema, input.key)
    if (parsedKey !== undefined && !parsedKey.success)
      return resultErrorCreate(op, v.summarize(parsedKey.issues), input.key)
    const key = parsedKey?.success ? parsedKey.output : undefined
    const url = new URL(key ? `${input.baseUrl.replace(/\/+$/, "")}/${key}` : input.baseUrl)
    const response = await (input.fetchImplementation ?? fetch)(url, { method: "HEAD" })
    if (!response.ok)
      return resultErrorCreate(op, `Custom domain probe failed with status ${response.status}`, {
        status: response.status,
      })
    const cacheControl = response.headers.get("cache-control") ?? undefined
    const mediaType = response.headers.get("content-type") ?? undefined
    const etag = response.headers.get("etag") ?? undefined
    if (input.expectedCacheControl !== undefined && cacheControl !== input.expectedCacheControl)
      return resultErrorCreate(op, "Custom domain cache policy did not match", { cacheControl })
    if (input.expectedMediaType !== undefined && mediaType !== input.expectedMediaType)
      return resultErrorCreate(op, "Custom domain content type did not match", { mediaType })
    if (input.expectedEtag !== undefined && etag !== input.expectedEtag)
      return resultErrorCreate(op, "Custom domain etag did not match", { etag })
    return {
      success: true,
      data: {
        url: url.toString(),
        status: response.status,
        ...(cacheControl === undefined ? {} : { cacheControl }),
        ...(mediaType === undefined ? {} : { mediaType }),
        ...(etag === undefined ? {} : { etag }),
      },
    }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}

type CustomDomainFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
