import { memoryStorageAdapterCreate } from "../infrastructure/storage/memoryStorageAdapter.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageObjectLocation } from "../storage/storageObjectLocation.js"

export type FixtureUploadStorage = {
  storage: StorageAdapter
  requestHandle: (request: Request) => Promise<Response | null>
}

type SignedLocation = StorageObjectLocation & { bucket: string; objectKey: string }

const uploadPathPrefix = "/fixture-upload/"

const corsHeadersCreate = (origin: string | null): Record<string, string> => ({
  "access-control-allow-origin": origin ?? "*",
  "access-control-allow-methods": "PUT, OPTIONS",
  "access-control-allow-headers": "content-type, content-length, x-amz-meta-sha256",
  "access-control-max-age": "600",
})

/**
 * In-memory storage whose signed upload intents point back at the fixture
 * origin, so a real browser can run preflight, PUT, and completion without R2
 * credentials. Production keeps using the R2 adapter untouched.
 */
export const fixtureUploadStorageCreate = (options: { origin: string }): FixtureUploadStorage => {
  const inner = memoryStorageAdapterCreate()
  const signed = new Map<string, SignedLocation>()

  const storage: StorageAdapter = {
    ...inner,
    createSignedUploadIntent: async (input) => {
      const intent = await inner.createSignedUploadIntent(input)
      if (!intent.success) return intent
      const path = `${uploadPathPrefix}${input.location.bucket}/${input.location.objectKey}`
      signed.set(path, input.location)
      return { success: true, data: { ...intent.data, url: new URL(path, options.origin).toString() } }
    },
  }

  const requestHandle = async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname
    if (!path.startsWith(uploadPathPrefix)) return null
    const origin = request.headers.get("origin")
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeadersCreate(origin) })
    const headers = corsHeadersCreate(origin)
    if (request.method !== "PUT") return new Response(null, { status: 405, headers })
    const location = signed.get(path)
    if (location === undefined) return new Response(null, { status: 404, headers })
    const bytes = new Uint8Array(await request.arrayBuffer())
    await inner.deleteObject(location)
    const stored = await inner.putImmutable({
      location,
      bytes,
      mediaType: request.headers.get("content-type") ?? "application/octet-stream",
    })
    if (!stored.success) return new Response(stored.errorMessage, { status: 400, headers })
    return new Response(null, {
      status: 200,
      headers: { ...headers, ...(stored.data.etag === undefined ? {} : { etag: stored.data.etag }) },
    })
  }

  return { storage, requestHandle }
}
