import { AwsClient } from "aws4fetch"
import * as v from "valibot"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { StorageAdapter } from "../../storage/storageAdapter.js"
import type { StorageObject } from "../../storage/storageObjectSchema.js"
import { storageObjectSchema } from "../../storage/storageObjectSchema.js"
import { storagePublicObjectKeyValidate } from "../../storage/storagePublicObjectKeyValidate.js"
import type { StorageUploadIntent } from "../../storage/storageUploadIntentSchema.js"
import type { R2StorageAdapterOptions } from "./r2StorageAdapterOptions.js"

export const r2StorageAdapterCreate = (input: R2StorageAdapterOptions): StorageAdapter => {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const now = input.now ?? (() => new Date())
  const aws = new AwsClient({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    service: "s3",
    region: "auto",
  })
  const bucketAllowed = (bucket: string): boolean =>
    (input.allowedBuckets?.includes(bucket) ?? false) ||
    (input.allowedBuckets === undefined && (input.defaultBucket === undefined || bucket === input.defaultBucket))

  return {
    createSignedUploadIntent: async (intentInput) => {
      const op = "r2StorageAdapterCreate"
      if (intentInput.expiresInSeconds < 1 || intentInput.expiresInSeconds > 3600) {
        return resultErrorCreate(op, "Upload intent expiry must be between 1 and 3600 seconds")
      }
      if (!Number.isInteger(intentInput.byteSize) || intentInput.byteSize < 0)
        return resultErrorCreate(op, "Upload byte size must be a non-negative integer")
      if (!bucketAllowed(intentInput.location.bucket)) {
        return resultErrorCreate(op, "Storage bucket is not configured for this adapter")
      }
      try {
        const createdAt = intentInput.now ?? now()
        const expiresAt = new Date(createdAt.getTime() + intentInput.expiresInSeconds * 1000)
        const unsignedUrl = objectUrl(input.endpoint, intentInput.location.bucket, intentInput.location.objectKey)
        unsignedUrl.searchParams.set("X-Amz-Expires", String(intentInput.expiresInSeconds))
        const signed = await aws.sign(unsignedUrl.toString(), {
          method: "PUT",
          aws: { signQuery: true, datetime: timestampCreate(createdAt) },
          datetime: timestampCreate(createdAt),
          signQuery: true,
        } as never)
        const intent: StorageUploadIntent = {
          method: "PUT",
          url: signed.url,
          key: intentInput.location.objectKey,
          expiresAt: expiresAt.toISOString(),
          headers: {
            "content-type": intentInput.mediaType,
            "content-length": String(intentInput.byteSize),
            ...(intentInput.sha256 ? { "x-amz-meta-sha256": intentInput.sha256 } : {}),
          },
          mediaType: intentInput.mediaType,
          byteSize: intentInput.byteSize,
          ...(intentInput.sha256 ? { sha256: intentInput.sha256 } : {}),
        }
        return { success: true, data: intent }
      } catch (error) {
        return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
      }
    },
    headObject: async (location) => {
      if (!bucketAllowed(location.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const response = await request("HEAD", location.bucket, location.objectKey)
      if (!response.success) return response
      if (response.data.status === 404) return { success: true, data: null }
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      const fromHead = storageObjectFromHeaders(location.objectKey, response.data.headers)
      if (fromHead.success) return fromHead
      const body = await request("GET", location.bucket, location.objectKey)
      if (!body.success) return body
      if (body.data.status === 404) return { success: true, data: null }
      if (!body.data.ok) return responseError("r2StorageAdapterCreate", body.data)
      const bytes = new Uint8Array(await body.data.arrayBuffer())
      const sha256 = await hexDigest(bytes)
      return {
        success: true,
        data: {
          key: location.objectKey,
          byteSize: bytes.byteLength,
          mediaType: body.data.headers.get("content-type") ?? undefined,
          sha256: body.data.headers.get("x-amz-meta-sha256") ?? sha256,
          ...(body.data.headers.get("etag") ? { etag: body.data.headers.get("etag") as string } : {}),
          ...(body.data.headers.get("cache-control")
            ? { cacheControl: body.data.headers.get("cache-control") as string }
            : {}),
        },
      }
    },
    readObject: async (location) => {
      if (!bucketAllowed(location.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const response = await request("GET", location.bucket, location.objectKey)
      if (!response.success) return response
      if (response.data.status === 404) return { success: true, data: null }
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      try {
        return { success: true, data: new Uint8Array(await response.data.arrayBuffer()) }
      } catch (error) {
        return resultErrorCreate("r2StorageAdapterCreate", error instanceof Error ? error.message : String(error))
      }
    },
    readObjectStream: async (location) => {
      if (!bucketAllowed(location.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const response = await request("GET", location.bucket, location.objectKey)
      if (!response.success) return response
      if (response.data.status === 404) return { success: true, data: null }
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      return { success: true, data: response.data.body }
    },
    listObjects: async (listInput) => {
      const maxKeys = listInput.maxKeys ?? 1000
      if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000)
        return resultErrorCreate("r2StorageAdapterCreate", "Storage object list size is invalid")
      if (!bucketAllowed(listInput.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const query = new URLSearchParams({ "list-type": "2", "max-keys": String(maxKeys) })
      if (listInput.prefix !== undefined) query.set("prefix", listInput.prefix)
      if (listInput.continuationToken !== undefined) query.set("continuation-token", listInput.continuationToken)
      const response = await request("GET", listInput.bucket, "", {}, undefined, query)
      if (!response.success) return response
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      try {
        const xml = await response.data.text()
        return r2ObjectListRead(xml)
      } catch (error) {
        return resultErrorCreate("r2StorageAdapterCreate", error instanceof Error ? error.message : String(error))
      }
    },
    putImmutable: async (putInput) => {
      if (putInput.location.namespace === "public-output") {
        const key = storagePublicObjectKeyValidate(putInput.location.key)
        if (!key.success) return key
      }
      if (!bucketAllowed(putInput.location.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const actualSha256 = await hexDigest(putInput.bytes)
      if (putInput.sha256 !== undefined && putInput.sha256 !== actualSha256)
        return resultErrorCreate("r2StorageAdapterCreate", "Storage object checksum does not match the bytes")
      const headers: Record<string, string> = {
        "content-type": putInput.mediaType,
        "cache-control":
          putInput.location.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store",
        "if-none-match": "*",
      }
      headers["x-amz-meta-sha256"] = actualSha256
      const response = await request(
        "PUT",
        putInput.location.bucket,
        putInput.location.objectKey,
        headers,
        putInput.bytes,
      )
      if (!response.success) return response
      if (response.data.status === 412) {
        const existing = await thisHead(putInput.location.bucket, putInput.location.objectKey)
        if (!existing.success) return existing
        if (existing.data !== null)
          return {
            success: true,
            data: {
              ...existing.data,
              mediaType: existing.data.mediaType ?? putInput.mediaType,
              sha256: existing.data.sha256 ?? actualSha256,
            },
          }
        return resultErrorCreate("r2StorageAdapterCreate", "Storage object already exists")
      }
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      const stored = await thisHead(putInput.location.bucket, putInput.location.objectKey)
      if (!stored.success) return stored
      if (stored.data === null) return resultErrorCreate("r2StorageAdapterCreate", "Uploaded object is missing")
      if (stored.data.byteSize !== putInput.bytes.byteLength)
        return resultErrorCreate("r2StorageAdapterCreate", "Uploaded object size does not match")
      if (stored.data.mediaType !== putInput.mediaType)
        return resultErrorCreate("r2StorageAdapterCreate", "Uploaded object content type does not match")
      if (stored.data.sha256 !== actualSha256)
        return resultErrorCreate("r2StorageAdapterCreate", "Uploaded object checksum does not match")
      const expectedCacheControl =
        putInput.location.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store"
      if (stored.data.cacheControl !== expectedCacheControl)
        return resultErrorCreate("r2StorageAdapterCreate", "Uploaded object cache policy does not match")
      return {
        success: true,
        data: stored.data,
      }
    },
    copyImmutable: async (copyInput) => {
      if (copyInput.destination.namespace === "public-output") {
        const key = storagePublicObjectKeyValidate(copyInput.destination.key)
        if (!key.success) return key
      }
      if (!bucketAllowed(copyInput.source.bucket) || !bucketAllowed(copyInput.destination.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const source = await thisHead(copyInput.source.bucket, copyInput.source.objectKey)
      if (!source.success) return source
      if (source.data === null) return resultErrorCreate("r2StorageAdapterCreate", "Source object is missing")
      const mediaType = copyInput.mediaType ?? source.data.mediaType
      const sha256 = copyInput.sha256 ?? source.data.sha256
      if (mediaType === undefined || sha256 === undefined)
        return resultErrorCreate("r2StorageAdapterCreate", "Source object metadata is incomplete")
      const headers: Record<string, string> = {
        "if-none-match": "*",
        "x-amz-copy-source": `/${copyInput.source.bucket}/${copyInput.source.objectKey}`,
        "cache-control":
          copyInput.destination.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store",
        "content-type": mediaType,
        "x-amz-meta-sha256": sha256,
        "x-amz-metadata-directive": "REPLACE",
      }
      const response = await request("PUT", copyInput.destination.bucket, copyInput.destination.objectKey, headers)
      if (!response.success) return response
      if (response.data.status === 412) {
        const existing = await thisHead(copyInput.destination.bucket, copyInput.destination.objectKey)
        if (!existing.success) return existing
        if (existing.data !== null)
          return {
            success: true,
            data: {
              ...existing.data,
              mediaType: existing.data.mediaType ?? mediaType,
              sha256: existing.data.sha256 ?? sha256,
            },
          }
        return resultErrorCreate("r2StorageAdapterCreate", "Storage object already exists")
      }
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      const copied = await thisHead(copyInput.destination.bucket, copyInput.destination.objectKey)
      if (!copied.success || copied.data === null)
        return copied.success ? resultErrorCreate("r2StorageAdapterCreate", "Copied object is missing") : copied
      if (copied.data.mediaType !== mediaType)
        return resultErrorCreate("r2StorageAdapterCreate", "Copied object content type does not match")
      if (copied.data.sha256 !== sha256)
        return resultErrorCreate("r2StorageAdapterCreate", "Copied object checksum does not match")
      const expectedCacheControl =
        copyInput.destination.namespace === "public-output" ? "public, max-age=31536000, immutable" : "no-store"
      if (copied.data.cacheControl !== expectedCacheControl)
        return resultErrorCreate("r2StorageAdapterCreate", "Copied object cache policy does not match")
      return {
        success: true,
        data: {
          ...copied.data,
          mediaType,
          sha256,
        },
      }
    },
    deleteObject: async (location) => {
      if (!bucketAllowed(location.bucket))
        return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const response = await request("DELETE", location.bucket, location.objectKey)
      if (!response.success) return response
      if (!response.data.ok && response.data.status !== 404)
        return responseError("r2StorageAdapterCreate", response.data)
      return { success: true, data: undefined }
    },
    probeCredentials: async (bucket) => {
      if (!bucketAllowed(bucket)) return resultErrorCreate("r2StorageAdapterCreate", "Storage bucket is not configured")
      const response = await request("HEAD", bucket, "")
      if (!response.success) return response
      if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
      return { success: true, data: { reachable: true, status: response.data.status } }
    },
  }

  async function thisHead(bucket: string, key: string): Promise<Result<StorageObject | null>> {
    const response = await request("HEAD", bucket, key)
    if (!response.success) return response
    if (response.data.status === 404) return { success: true, data: null }
    if (!response.data.ok) return responseError("r2StorageAdapterCreate", response.data)
    return storageObjectFromHeaders(key, response.data.headers)
  }

  async function request(
    method: string,
    bucket: string,
    key: string,
    extraHeaders: Record<string, string> = {},
    body?: Uint8Array,
    query: URLSearchParams = new URLSearchParams(),
  ): Promise<Result<Response>> {
    const op = "r2StorageAdapterCreate"
    try {
      const unsignedUrl = objectUrl(input.endpoint, bucket, key, query)
      const signed = await aws.sign(unsignedUrl.toString(), {
        method,
        headers: extraHeaders,
        body: body ? Buffer.from(body) : undefined,
      })
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)
      let response: Response
      try {
        response = await fetchImplementation(signed.url, {
          method,
          headers: signed.headers,
          body: body ? Buffer.from(body) : undefined,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      return { success: true, data: response }
    } catch (error) {
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
    }
  }
}

function responseError(op: string, response: Response): Result<never> {
  return resultErrorCreate(op, `R2 request failed with status ${response.status}`, { status: response.status })
}

function storageObjectFromHeaders(key: string, headers: Headers): Result<StorageObject> {
  const byteSize = Number(headers.get("content-length"))
  if (!Number.isInteger(byteSize) || byteSize < 0)
    return resultErrorCreate("r2StorageAdapterCreate", "R2 response has no valid content length")
  return {
    success: true,
    data: {
      key,
      byteSize,
      ...(headers.get("content-type") ? { mediaType: headers.get("content-type") as string } : {}),
      ...(headers.get("x-amz-meta-sha256") ? { sha256: headers.get("x-amz-meta-sha256") as string } : {}),
      ...(headers.get("etag") ? { etag: headers.get("etag") as string } : {}),
      ...(headers.get("cache-control") ? { cacheControl: headers.get("cache-control") as string } : {}),
    },
  }
}

function r2ObjectListRead(
  xml: string,
): Result<{ objects: readonly StorageObject[]; nextContinuationToken: string | null }> {
  const op = "r2ObjectListRead"
  const objects: StorageObject[] = []
  for (const content of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const value = content[1]
    if (value === undefined) continue
    const key = xmlTagRead(value, "Key")
    const size = Number(xmlTagRead(value, "Size"))
    const lastModified = xmlTagRead(value, "LastModified")
    if (key === null || !Number.isInteger(size) || size < 0 || lastModified === null) {
      return resultErrorCreate(op, "R2 object list contained an invalid object")
    }
    const parsed = v.safeParse(storageObjectSchema, {
      key,
      byteSize: size,
      ...(xmlTagRead(value, "ETag") ? { etag: xmlTagRead(value, "ETag") } : {}),
      lastModified,
    })
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))
    objects.push(parsed.output)
  }
  return {
    success: true,
    data: {
      objects,
      nextContinuationToken: xmlTagRead(xml, "NextContinuationToken"),
    },
  }
}

function xmlTagRead(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (match?.[1] === undefined) return null
  return xmlUnescape(match[1])
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function objectUrl(endpoint: string, bucket: string, key: string, query = new URLSearchParams()): URL {
  const base = new URL(endpoint)
  const prefix = base.pathname.replace(/\/+$/, "")
  base.pathname = `${prefix}/${encodePathPart(bucket)}${key.length > 0 ? `/${encodePath(key)}` : ""}`
  base.search = query.toString()
  return base
}

function encodePath(key: string): string {
  return key.split("/").map(encodePathPart).join("/")
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value)
}

function timestampCreate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

async function hexDigest(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("")
}
