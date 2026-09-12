import { describe, expect, test } from "bun:test"

import { customDomainProbe } from "../src/infrastructure/storage/customDomainProbe.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { r2StorageAdapterCreate } from "../src/infrastructure/storage/r2StorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageBucketDedicatedValidate } from "../src/storage/storageBucketDedicatedValidate.js"
import { storageCopyImmutable } from "../src/storage/storageCopyImmutable.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../src/storage/storageObjectVerify.js"
import { storageProjectObjectsDelete } from "../src/storage/storageProjectObjectsDelete.js"
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

  test("deletes all project objects across listing pages without touching another prefix", async () => {
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const adapter = memoryStorageAdapterCreate()
    const objects = [
      ["private-source", "uploads/one"],
      ["private-staging", "uploads/two"],
      ["public-output", "outputs/three_v1.png"],
    ] as const
    for (const [namespace, key] of objects) {
      const location = storageObjectLocationCreate(binding.data, namespace, key)
      if (!location.success) return
      await adapter.putImmutable({ location: location.data, bytes: png, mediaType: "image/png" })
    }
    const otherBinding = storageBindingResolve({
      ...environment,
      projectId: "project-2",
      r2Prefix: "projects/project-2",
    })
    if (!otherBinding.success) return
    const otherLocation = storageObjectLocationCreate(otherBinding.data, "private-source", "kept")
    if (!otherLocation.success) return
    await adapter.putImmutable({ location: otherLocation.data, bytes: png, mediaType: "image/png" })

    const deletedLocations: Array<{ namespace: string; key: string }> = []
    const trackingAdapter = {
      ...adapter,
      deleteObject: async (location: Parameters<typeof adapter.deleteObject>[0]) => {
        deletedLocations.push({ namespace: location.namespace, key: location.key })
        return adapter.deleteObject(location)
      },
    }
    const deleted = await storageProjectObjectsDelete(trackingAdapter, { binding: binding.data, maxKeys: 1 })

    expect(deleted).toEqual({ success: true, data: { deletedCount: 3 } })
    expect(deletedLocations).toEqual([
      { namespace: "private-source", key: "uploads/one" },
      { namespace: "private-staging", key: "uploads/two" },
      { namespace: "public-output", key: "outputs/three_v1.png" },
    ])
    expect(await adapter.listObjects?.({ bucket: binding.data.bucket, prefix: "projects/project-1/" })).toMatchObject({
      success: true,
      data: { objects: [] },
    })
    expect(
      await adapter.listObjects?.({ bucket: otherBinding.data.bucket, prefix: "projects/project-2/" }),
    ).toMatchObject({
      success: true,
      data: { objects: [{ key: "projects/project-2/private/source/kept" }] },
    })
  })

  test("only proves a bucket dedicated when no other project binding references it, including root buckets", () => {
    const dedicated = storageBucketDedicatedValidate({
      projectId: "project-1",
      bucket: "dedicated-bucket",
      bindings: [
        {
          projectId: "project-1",
          environment: "development",
          bucket: "dedicated-bucket",
          prefix: "projects/project-1",
          publicBaseUrl: "https://dev.assets.example.test",
        },
      ],
    })
    expect(dedicated).toMatchObject({ success: true, data: { projectId: "project-1", bucket: "dedicated-bucket" } })

    const shared = storageBucketDedicatedValidate({
      projectId: "project-1",
      bucket: "shared-bucket",
      bindings: [
        {
          projectId: "project-1",
          environment: "development",
          bucket: "shared-bucket",
          prefix: "",
          publicBaseUrl: "https://dev.assets.example.test",
        },
        {
          projectId: "project-2",
          environment: "development",
          bucket: "shared-bucket",
          prefix: "",
          publicBaseUrl: "https://dev.assets.example.test",
        },
      ],
    })
    expect(shared).toMatchObject({ success: false, errorMessage: "The bucket is shared with another project" })

    const root = storageBucketDedicatedValidate({
      projectId: "project-1",
      bucket: "root-bucket",
      bindings: [
        {
          projectId: "project-1",
          environment: "development",
          bucket: "root-bucket",
          prefix: "",
          publicBaseUrl: "https://dev.assets.example.test",
        },
      ],
    })
    expect(root).toMatchObject({ success: true, data: { projectId: "project-1", bucket: "root-bucket" } })
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
      fetchImplementation: async (request, init) => {
        const requestUrl = request instanceof Request ? request.url : request.toString()
        requests.push(new Request(requestUrl, init))
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
    expect(requests.map(({ method }) => method)).toEqual(["PUT", "HEAD", "DELETE"])
    expect(new Set(requests.map(({ url }) => new URL(url).pathname)).size).toBe(1)
    expect(
      /^\/project-configured-bucket\/_assets-service-probes\/[0-9a-f-]{36}$/u.test(
        new URL(requests[0]?.url ?? "https://invalid.test").pathname,
      ),
    ).toBe(true)
  })

  test("requests identity encoding for signed R2 object HEADs", async () => {
    let requestHeaders: Headers | undefined
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        requestHeaders = new Headers(init?.headers)
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": String(png.byteLength),
            "content-type": "image/png",
            etag: '"strong-etag"',
          },
        })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/head")
    if (!location.success) return

    const object = await adapter.headObject(location.data)

    expect(object).toMatchObject({ success: true, data: { byteSize: png.byteLength, etag: '"strong-etag"' } })
    expect(requestHeaders?.get("accept-encoding")).toBe("identity")
  })

  test("recovers an R2 object with a guarded identity GET and streamed SHA-256 when HEAD length is unsafe", async () => {
    const requests: Array<{ method: string; headers: Headers }> = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        const method = init?.method ?? "GET"
        requests.push({ method, headers: new Headers(init?.headers) })
        if (method === "GET") {
          const response = new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(png.slice(0, 2))
                controller.enqueue(png.slice(2))
                controller.close()
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "image/png",
                etag: '"strong-etag"',
              },
            },
          )
          Object.defineProperty(response, "arrayBuffer", {
            value: () => {
              throw new Error("fallback GET must not buffer its body")
            },
          })
          return response
        }
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": "9007199254740992",
            "content-type": "image/png",
            etag: '"strong-etag"',
          },
        })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/gzip-head")
    if (!location.success) return

    const object = await adapter.headObject(location.data)

    expect(object).toMatchObject({
      success: true,
      data: { byteSize: png.byteLength, etag: '"strong-etag"', sha256: contentSha256Create(png) },
    })
    expect(requests.map((request) => request.method)).toEqual(["HEAD", "GET"])
    expect(requests[0]?.headers.get("accept-encoding")).toBe("identity")
    expect(requests[1]?.headers.get("accept-encoding")).toBe("identity")
    expect(requests[1]?.headers.get("if-match")).toBe('"strong-etag"')
  })

  test("returns null when the guarded R2 fallback GET finds no object", async () => {
    const methods: string[] = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        methods.push(init?.method ?? "GET")
        if (init?.method === "GET") return new Response(null, { status: 404 })
        return new Response(null, { status: 200, headers: { etag: '"missing-fallback"' } })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/missing-fallback")
    if (!location.success) return

    const object = await adapter.headObject(location.data)

    expect(object).toEqual({ success: true, data: null })
    expect(methods).toEqual(["HEAD", "GET"])
  })

  test("does not recover an R2 object without a non-empty strong HEAD ETag", async () => {
    for (const etag of [undefined, "", 'W/"weak-etag"', '"unterminated', '"bad"etag', '"bad etag"', "*"]) {
      const methods: string[] = []
      const adapter = r2StorageAdapterCreate({
        accountId: "account",
        accessKeyId: "access",
        secretAccessKey: "secret",
        endpoint: "https://account.r2.cloudflarestorage.com",
        fetchImplementation: async (_url, init) => {
          methods.push(init?.method ?? "GET")
          return new Response(null, {
            status: 200,
            headers: {
              "content-encoding": "gzip",
              ...(etag === undefined ? {} : { etag }),
            },
          })
        },
      })
      const binding = storageBindingResolve(environment)
      if (!binding.success) return
      const location = storageObjectLocationCreate(
        binding.data,
        "private-staging",
        `uploads/no-etag-${etag ?? "missing"}`,
      )
      if (!location.success) return

      const object = await adapter.headObject(location.data)

      expect(object).toMatchObject({
        success: false,
        op: "r2StorageAdapterCreate",
        errorMessage: "R2 response has no valid content length",
      })
      expect(methods).toEqual(["HEAD"])
    }
  })

  test("rejects a guarded R2 GET with a missing or mismatched ETag", async () => {
    for (const getEtag of [undefined, '"other-etag"', 'W/"head-etag"', '"unterminated']) {
      const requests: Array<{ method: string; headers: Headers }> = []
      const adapter = r2StorageAdapterCreate({
        accountId: "account",
        accessKeyId: "access",
        secretAccessKey: "secret",
        endpoint: "https://account.r2.cloudflarestorage.com",
        fetchImplementation: async (_url, init) => {
          const method = init?.method ?? "GET"
          requests.push({ method, headers: new Headers(init?.headers) })
          if (method === "HEAD")
            return new Response(null, { status: 200, headers: { etag: '"head-etag"', "content-type": "image/png" } })
          return new Response(png, {
            status: 200,
            headers: {
              ...(getEtag === undefined ? {} : { etag: getEtag }),
            },
          })
        },
      })
      const binding = storageBindingResolve(environment)
      if (!binding.success) return
      const location = storageObjectLocationCreate(
        binding.data,
        "private-staging",
        `uploads/get-etag-${getEtag ?? "missing"}`,
      )
      if (!location.success) return

      const object = await adapter.headObject(location.data)

      expect(object).toMatchObject({ success: false, op: "r2StorageAdapterCreate" })
      expect(requests.map((request) => request.method)).toEqual(["HEAD", "GET"])
      expect(requests[1]?.headers.get("accept-encoding")).toBe("identity")
      expect(requests[1]?.headers.get("if-match")).toBe('"head-etag"')
    }
  })

  test("rejects a guarded R2 GET that returns 412", async () => {
    const methods: string[] = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        methods.push(init?.method ?? "GET")
        if (init?.method === "GET") return new Response(null, { status: 412 })
        return new Response(null, { status: 200, headers: { etag: '"head-etag"' } })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/get-412")
    if (!location.success) return

    const object = await adapter.headObject(location.data)

    expect(object).toMatchObject({
      success: false,
      op: "r2StorageAdapterCreate",
      errorMessage: "R2 request failed with status 412",
    })
    expect(methods).toEqual(["HEAD", "GET"])
  })

  test("rejects a guarded R2 GET when its body cannot be read", async () => {
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        if (init?.method === "GET") {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("R2 body read failed"))
            },
          })
          return new Response(body, { status: 200, headers: { etag: '"head-etag"' } })
        }
        return new Response(null, { status: 200, headers: { etag: '"head-etag"' } })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const location = storageObjectLocationCreate(binding.data, "private-staging", "uploads/read-failure")
    if (!location.success) return

    const object = await adapter.headObject(location.data)

    expect(object).toMatchObject({
      success: false,
      op: "r2StorageAdapterCreate",
      errorMessage: "R2 body read failed",
    })
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

  test("keeps R2 immutable copy reruns idempotent after a 412", async () => {
    const checksum = contentSha256Create(png)
    const methods: string[] = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (_url, init) => {
        const method = init?.method ?? "GET"
        methods.push(method)
        if (method === "PUT") return new Response(null, { status: 412 })
        return new Response(null, {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "content-length": String(png.byteLength),
            "content-type": "image/png",
            etag: checksum,
            "x-amz-meta-sha256": checksum,
          },
        })
      },
    })
    const binding = storageBindingResolve(environment)
    if (!binding.success) return
    const source = storageObjectLocationCreate(binding.data, "private-staging", "uploads/source")
    const destination = storageObjectLocationCreate(binding.data, "private-source", "sources/copied")
    if (!source.success || !destination.success) return

    const copied = await storageCopyImmutable(adapter, {
      source: source.data,
      destination: destination.data,
      mediaType: "image/png",
      sha256: checksum,
    })

    expect(copied).toMatchObject({ success: true, data: { byteSize: png.byteLength, sha256: checksum } })
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
