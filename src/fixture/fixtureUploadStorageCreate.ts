import { memoryStorageAdapterCreate } from "../infrastructure/storage/memoryStorageAdapter.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import type { StorageObjectLocation } from "../storage/storageObjectLocation.js"
import type { FixtureStorageObject } from "./fixtureStorageObjectsCreate.js"

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
export const fixtureUploadStorageCreate = (options: {
  origin: string
  publicBaseUrl?: string
  objects?: readonly FixtureStorageObject[]
}): FixtureUploadStorage => {
  const inner = memoryStorageAdapterCreate()
  const signed = new Map<string, SignedLocation>()
  const seeded = new Map<string, FixtureStorageObject>()
  const publicObjects = new Map<string, FixtureStorageObject>()
  const locationKey = (location: StorageObjectLocation & { bucket: string; objectKey: string }) =>
    `${location.bucket}/${location.objectKey}`

  for (const object of options.objects ?? []) {
    seeded.set(locationKey(object.location), object)
    if (object.publicPath !== undefined) publicObjects.set(object.publicPath, object)
  }

  const seededObjectRead = (location: StorageObjectLocation & { bucket: string; objectKey: string }) =>
    seeded.get(locationKey(location))

  const storage: StorageAdapter = {
    ...inner,
    headObject: async (location) => {
      const object = seededObjectRead(location)
      if (object !== undefined)
        return {
          success: true,
          data: {
            key: location.objectKey,
            byteSize: object.bytes.byteLength,
            mediaType: object.mediaType,
            cacheControl: location.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store",
          },
        }
      return inner.headObject(location)
    },
    readObject: async (location) => {
      const object = seededObjectRead(location)
      if (object !== undefined) return { success: true, data: new Uint8Array(object.bytes) }
      return inner.readObject(location)
    },
    readObjectStream: async (location) => {
      const object = seededObjectRead(location)
      if (object !== undefined)
        return {
          success: true,
          data: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(object.bytes))
              controller.close()
            },
          }),
        }
      return inner.readObjectStream?.(location) ?? { success: true, data: null }
    },
    putImmutable: async (input) => {
      const stored = await inner.putImmutable(input)
      if (stored.success && input.location.namespace === "public-output")
        publicObjects.set(input.location.key, {
          location: input.location,
          bytes: input.bytes,
          mediaType: input.mediaType,
        })
      return stored
    },
    deleteObject: async (location) => {
      seeded.delete(locationKey(location))
      publicObjects.delete(location.key)
      return inner.deleteObject(location)
    },
    createSignedUploadIntent: async (input) => {
      const intent = await inner.createSignedUploadIntent(input)
      if (!intent.success) return intent
      const path = `${uploadPathPrefix}${input.location.bucket}/${input.location.objectKey}`
      signed.set(path, input.location)
      return { success: true, data: { ...intent.data, url: new URL(path, options.origin).toString() } }
    },
  }

  const requestHandle = async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url)
    const path = url.pathname
    const publicPath = path.replace(/^\/+/, "")
    const publicOrigin = new URL(options.publicBaseUrl ?? options.origin).origin
    const publicObject = url.origin === publicOrigin ? publicObjects.get(publicPath) : undefined
    if (publicObject !== undefined) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 })
      return new Response(request.method === "HEAD" ? null : (publicObject.bytes as unknown as ArrayBuffer), {
        status: 200,
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
          "content-length": String(publicObject.bytes.byteLength),
          "content-type": publicObject.mediaType,
        },
      })
    }
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
