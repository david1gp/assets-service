import { describe, expect, test } from "bun:test"

import { customDomainProbe } from "../src/infrastructure/storage/customDomainProbe.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { r2StorageAdapterCreate } from "../src/infrastructure/storage/r2StorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageCopyImmutable } from "../src/storage/storageCopyImmutable.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../src/storage/storageObjectVerify.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"
import { storageUploadIntentComplete } from "../src/storage/storageUploadIntentComplete.js"
import { storageUploadIntentCreate } from "../src/storage/storageUploadIntentCreate.js"

const environment = {
  id: "environment-1",
  projectId: "project-1",
  name: "development" as const,
  r2Bucket: "assets-development",
  r2Prefix: "projects/project-1",
  publicBaseUrl: "https://dev.assets.example.test",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

describe("storage adapters", () => {
  test("binds project environments and keeps namespaces separate", async () => {
    const binding = storageBindingResolve(environment)
    expect(binding.success).toBe(true)
    if (!binding.success) return
    expect(storageBindingResolve(environment, "other-project").success).toBe(false)

    const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-1")
    const publicOutput = storageObjectLocationCreate(binding.data, "public-output", "images/hero_v1.webp")
    expect(staging.success).toBe(true)
    expect(publicOutput.success).toBe(true)
    if (!staging.success || !publicOutput.success) return
    expect(staging.data.objectKey).not.toBe(publicOutput.data.objectKey)

    const adapter = memoryStorageAdapterCreate({ now: () => new Date("2026-08-17T12:00:00.000Z") })
    const intent = await storageUploadIntentCreate(adapter, {
      binding: binding.data,
      uploadId: "upload-1",
      byteSize: png.byteLength,
      mediaType: "image/png",
      now: new Date("2026-08-17T12:00:00.000Z"),
    })
    expect(intent).toMatchObject({
      success: true,
      data: {
        key: "projects/project-1/private/staging/uploads/upload-1",
        expiresAt: "2026-08-17T12:10:00.000Z",
      },
    })
  })

  test("resolves a binding with an empty prefix", () => {
    const binding = storageBindingResolve({ ...environment, r2Prefix: "" })
    expect(binding).toMatchObject({ success: true, data: { prefix: "" } })
  })

  test("uses bucket-root namespace keys for empty-prefix storage operations", async () => {
    const binding = storageBindingResolve({ ...environment, r2Prefix: "" })
    expect(binding.success).toBe(true)
    if (!binding.success) return
    const staging = storageObjectLocationCreate(binding.data, "private-staging", "uploads/empty-prefix")
    const source = storageObjectLocationCreate(binding.data, "private-source", "sources/empty-prefix/source.png")
    const publicOutput = storageObjectLocationCreate(binding.data, "public-output", "images/empty-prefix/hero_v1.png")
    expect(staging).toMatchObject({ success: true, data: { objectKey: "private/staging/uploads/empty-prefix" } })
    expect(source).toMatchObject({
      success: true,
      data: { objectKey: "private/source/sources/empty-prefix/source.png" },
    })
    expect(publicOutput).toMatchObject({ success: true, data: { objectKey: "public/images/empty-prefix/hero_v1.png" } })
    if (!staging.success || !source.success || !publicOutput.success) return

    const adapter = memoryStorageAdapterCreate()
    expect(
      await storagePutImmutable(adapter, { location: staging.data, bytes: png, mediaType: "image/png" }),
    ).toMatchObject({
      success: true,
    })
    expect(
      await storagePutImmutable(adapter, { location: source.data, bytes: png, mediaType: "image/png" }),
    ).toMatchObject({
      success: true,
    })
    expect(await adapter.readObject(source.data)).toEqual({ success: true, data: png })
    expect(await storageCopyImmutable(adapter, { source: source.data, destination: publicOutput.data })).toMatchObject({
      success: true,
    })
    expect(await adapter.listObjects?.({ bucket: binding.data.bucket })).toMatchObject({
      success: true,
      data: {
        objects: [
          { key: "private/source/sources/empty-prefix/source.png" },
          { key: "private/staging/uploads/empty-prefix" },
          { key: "public/images/empty-prefix/hero_v1.png" },
        ],
      },
    })
    await adapter.deleteObject(staging.data)
    await adapter.deleteObject(source.data)
    await adapter.deleteObject(publicOutput.data)
    expect(await adapter.listObjects?.({ bucket: binding.data.bucket })).toMatchObject({
      success: true,
      data: { objects: [] },
    })
  })

  test("verifies size, checksum, and detected media type", async () => {
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/upload-2")
    if (!location.success) return
    const adapter = memoryStorageAdapterCreate()
    const stored = await adapter.putImmutable({ location: location.data, bytes: png, mediaType: "image/png" })
    expect(stored.success).toBe(true)
    if (!stored.success || !stored.data.sha256) return

    const verified = await storageObjectVerify(adapter, {
      location: location.data,
      byteSize: png.byteLength,
      sha256: stored.data.sha256,
      mediaType: "image/png",
    })
    expect(verified).toMatchObject({ success: true, data: { byteSize: png.byteLength, mediaType: "image/png" } })
    expect(
      await storageObjectVerify(adapter, {
        location: location.data,
        byteSize: png.byteLength + 1,
        sha256: stored.data.sha256,
        mediaType: "image/png",
      }),
    ).toMatchObject({ success: false })
    expect(
      await storageObjectVerify(adapter, {
        location: location.data,
        byteSize: png.byteLength,
        sha256: "0".repeat(64),
        mediaType: "image/png",
      }),
    ).toMatchObject({ success: false })
    expect(
      await storageObjectVerify(adapter, {
        location: location.data,
        byteSize: png.byteLength,
        sha256: stored.data.sha256,
        mediaType: "image/jpeg",
      }),
    ).toMatchObject({ success: false })
  })

  test("accepts an upload only when the signed intent is current and the stored object verifies", async () => {
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/complete")
    if (!location.success) return
    const adapter = memoryStorageAdapterCreate()
    const sha256 = contentSha256Create(png)
    const intent = await storageUploadIntentCreate(adapter, {
      binding: binding.data,
      uploadId: "complete",
      byteSize: png.byteLength,
      mediaType: "image/png",
      sha256,
      now: new Date("2026-08-17T12:00:00.000Z"),
    })
    expect(intent.success).toBe(true)
    if (!intent.success) return
    await adapter.putImmutable({ location: location.data, bytes: png, mediaType: "image/png", sha256 })
    expect(
      await storageUploadIntentComplete(adapter, {
        intent: intent.data,
        location: location.data,
        sha256,
        now: new Date("2026-08-17T12:01:00.000Z"),
      }),
    ).toMatchObject({ success: true, data: { sha256 } })
    expect(
      await storageUploadIntentComplete(adapter, {
        intent: intent.data,
        location: location.data,
        sha256,
        now: new Date("2026-08-17T12:11:00.000Z"),
      }),
    ).toMatchObject({ success: false })
  })

  test("rejects immutable overwrites and copies to a new key", async () => {
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const source = storageObjectLocationCreate(binding.data, "private-staging", "uploads/source")
    const destination = storageObjectLocationCreate(binding.data, "public-output", "images/hero_v1.webp")
    if (!source.success || !destination.success) return
    const adapter = memoryStorageAdapterCreate()
    expect(
      await storagePutImmutable(adapter, { location: source.data, bytes: png, mediaType: "image/png" }),
    ).toMatchObject({ success: true })
    expect(
      await storagePutImmutable(adapter, { location: source.data, bytes: png, mediaType: "image/png" }),
    ).toMatchObject({ success: false })
    expect(await storageCopyImmutable(adapter, { source: source.data, destination: destination.data })).toMatchObject({
      success: true,
    })
    expect(await storageCopyImmutable(adapter, { source: source.data, destination: destination.data })).toMatchObject({
      success: false,
    })
    const unversioned = storageObjectLocationCreate(binding.data, "public-output", "images/hero.webp")
    if (!unversioned.success) return
    expect(await storageCopyImmutable(adapter, { source: source.data, destination: unversioned.data })).toMatchObject({
      success: false,
    })
    const hashed = storageObjectLocationCreate(binding.data, "public-output", "images/hero_1234abcd.webp")
    if (!hashed.success) return
    expect(
      await storagePutImmutable(adapter, { location: hashed.data, bytes: png, mediaType: "image/png" }),
    ).toMatchObject({
      success: true,
    })
  })

  test("signs runtime-selected R2 buckets and probes them", async () => {
    const requests: Request[] = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      now: () => new Date("2026-08-17T12:00:00.000Z"),
      fetchImplementation: async (request) => {
        const requestUrl = request instanceof Request ? request.url : request.toString()
        requests.push(new Request(requestUrl))
        return new Response(null, { status: 200 })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const runtimeBinding = { ...binding.data, bucket: "project-configured-bucket" }
    const location = storageObjectLocationCreate(runtimeBinding, "private-staging", "uploads/exact")
    if (!location.success) return
    const intent = await storageUploadIntentCreate(adapter, {
      binding: runtimeBinding,
      uploadId: "exact",
      byteSize: png.byteLength,
      mediaType: "image/png",
      now: new Date("2026-08-17T12:00:00.000Z"),
    })
    expect(intent).toMatchObject({ success: true, data: { method: "PUT", key: location.data.objectKey } })
    if (!intent.success) return
    expect(new URL(intent.data.url).pathname).toBe(`/project-configured-bucket/${location.data.objectKey}`)
    expect(new URL(intent.data.url).searchParams.get("X-Amz-Expires")).toBe("600")
    expect((await adapter.probeCredentials(runtimeBinding.bucket)).success).toBe(true)
    expect(requests).toHaveLength(1)
  })

  test("verifies R2 checksum, content type, and immutable cache policy after upload", async () => {
    const checksum = contentSha256Create(png)
    const requests: Array<{ method: string; headers: Headers }> = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      now: () => new Date("2026-08-17T12:00:00.000Z"),
      fetchImplementation: async (_url, init) => {
        const method = init?.method ?? "GET"
        requests.push({ method, headers: new Headers(init?.headers) })
        if (method === "PUT") return new Response(null, { status: 200 })
        return new Response(null, {
          status: 200,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": String(png.byteLength),
            "content-type": "image/png",
            "x-amz-meta-sha256": checksum,
          },
        })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "public-output", "images/hero_v1.png")
    if (!location.success) return
    const stored = await storagePutImmutable(adapter, {
      location: location.data,
      bytes: png,
      mediaType: "image/png",
      sha256: checksum,
    })
    expect(stored).toMatchObject({ success: true, data: { sha256: checksum, mediaType: "image/png" } })
    expect(requests[0]?.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(requests[0]?.headers.get("x-amz-meta-sha256")).toBe(checksum)
  })

  test("replaces R2 copy metadata when the source is private", async () => {
    const checksum = contentSha256Create(png)
    const methods: string[] = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      now: () => new Date("2026-08-17T12:00:00.000Z"),
      fetchImplementation: async (_url, init) => {
        const method = init?.method ?? "GET"
        methods.push(method)
        if (method === "PUT") return new Response(null, { status: 200 })
        return new Response(null, {
          status: 200,
          headers: {
            "cache-control": methods.length === 1 ? "no-store" : "public, max-age=31536000, immutable",
            "content-length": String(png.byteLength),
            "content-type": "image/png",
            "x-amz-meta-sha256": checksum,
          },
        })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const source = storageObjectLocationCreate(binding.data, "private-staging", "uploads/source")
    const destination = storageObjectLocationCreate(binding.data, "public-output", "images/copied_v1.png")
    if (!source.success || !destination.success) return
    const copied = await storageCopyImmutable(adapter, { source: source.data, destination: destination.data })
    expect(copied).toMatchObject({ success: true, data: { mediaType: "image/png", sha256: checksum } })
    expect(methods).toEqual(["HEAD", "PUT", "HEAD"])
  })

  test("probes a custom domain without exposing credentials", async () => {
    const result = await customDomainProbe({
      baseUrl: "https://dev.assets.example.test",
      key: "images/hero_v1.webp",
      fetchImplementation: async (request) => {
        const url = request instanceof Request ? request.url : request.toString()
        expect(new URL(url).pathname).toBe("/images/hero_v1.webp")
        return new Response(null, {
          status: 200,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-type": "image/webp",
          },
        })
      },
      expectedCacheControl: "public, max-age=31536000, immutable",
      expectedMediaType: "image/webp",
    })
    expect(result).toMatchObject({ success: true, data: { status: 200 } })
  })

  test("rejects custom-domain delivery with mutable cache headers", async () => {
    const result = await customDomainProbe({
      baseUrl: "https://dev.assets.example.test",
      key: "images/hero_v1.webp",
      expectedCacheControl: "public, max-age=31536000, immutable",
      fetchImplementation: async () =>
        new Response(null, { status: 200, headers: { "content-type": "image/webp", "cache-control": "no-cache" } }),
    })
    expect(result).toMatchObject({ success: false, op: "customDomainProbe" })
  })
})
