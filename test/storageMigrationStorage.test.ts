import { describe, expect, test } from "bun:test"

import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { r2StorageAdapterCreate } from "../src/infrastructure/storage/r2StorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storageCopyImmutable } from "../src/storage/storageCopyImmutable.js"
import { storageMigrationDestinationInventoryVerify } from "../src/storage/storageMigrationDestinationInventoryVerify.js"
import { storageMigrationObjectCopy } from "../src/storage/storageMigrationObjectCopy.js"
import { storageMigrationObjectLocationCreate } from "../src/storage/storageMigrationObjectLocationCreate.js"
import { storageMigrationSourceInventoryRead } from "../src/storage/storageMigrationSourceInventoryRead.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { StorageObject } from "../src/storage/storageObjectSchema.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"

const sourceBinding = {
  projectId: "project-1",
  environmentId: "environment-1",
  environment: "development" as const,
  bucket: "source-bucket",
  prefix: "projects/project-1",
  publicBaseUrl: "https://source.example.test",
}

const targetBinding = {
  ...sourceBinding,
  bucket: "target-bucket",
  prefix: "archive/project-1",
  publicBaseUrl: "https://target.example.test",
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const json = new TextEncoder().encode('{"ok":true}')

describe("storage migration primitives", () => {
  test("reads a paginated inventory with namespace and prefix boundaries", async () => {
    const adapter = memoryStorageAdapterCreate()
    await storagePut(adapter, sourceBinding, "private-staging", "uploads/staging", png, "image/png")
    await storagePut(adapter, sourceBinding, "private-source", "sources/source", png, "image/png")
    await storagePut(adapter, sourceBinding, "public-output", "images/hero_v1.png", png, "image/png")
    await storagePut(
      adapter,
      { ...sourceBinding, prefix: "projects/project-10" },
      "private-source",
      "sources/other-project",
      png,
      "image/png",
    )

    const calls: Array<{ prefix?: string; continuationToken?: string }> = []
    const paginated: StorageAdapter = {
      ...adapter,
      listObjects: async (input) => {
        calls.push({ prefix: input.prefix, continuationToken: input.continuationToken })
        return adapter.listObjects?.(input) ?? { success: true, data: { objects: [], nextContinuationToken: null } }
      },
    }
    const inventory = await storageMigrationSourceInventoryRead(paginated, { sourceBinding, maxKeys: 1 })

    expect(inventory.success).toBe(true)
    expect(inventory.success ? inventory.data[0]?.namespace : undefined).toBe("private-source")
    expect(inventory.success ? inventory.data : []).toHaveLength(3)
    expect(calls).toEqual([
      { prefix: "projects/project-1/", continuationToken: undefined },
      { prefix: "projects/project-1/", continuationToken: "1" },
      { prefix: "projects/project-1/", continuationToken: "2" },
    ])
    if (!inventory.success) return
    expect(inventory.data.map((item) => item.location.objectKey)).toEqual([
      "projects/project-1/private/source/sources/source",
      "projects/project-1/private/staging/uploads/staging",
      "projects/project-1/public/images/hero_v1.png",
    ])
    expect(inventory.data.every((item) => item.object.sha256 === contentSha256Create(png))).toBe(true)
  })

  test("fails closed for unknown objects inside the exact source prefix", async () => {
    const adapter = memoryStorageAdapterCreate()
    const unknown: StorageObject = { key: "projects/project-1/unmanaged/object", byteSize: png.byteLength }
    const outside: StorageObject = {
      key: "projects/project-10/private/source/sources/object",
      byteSize: png.byteLength,
    }
    const listing: StorageAdapter = {
      ...adapter,
      listObjects: async () => ({
        success: true,
        data: { objects: [outside, unknown], nextContinuationToken: null },
      }),
    }

    const inventory = await storageMigrationSourceInventoryRead(listing, { sourceBinding })

    expect(inventory).toMatchObject({ success: false })
    expect(inventory.success ? undefined : inventory.errorMessage).toContain("unknown object")
  })

  test("ignores objects outside an exact source prefix even if a listing adapter overreturns", async () => {
    const outside: StorageObject = {
      key: "projects/project-10/private/source/sources/object",
      byteSize: png.byteLength,
    }
    const adapter = memoryStorageAdapterCreate()
    const overreturning: StorageAdapter = {
      ...adapter,
      listObjects: async () => ({
        success: true,
        data: { objects: [outside], nextContinuationToken: null },
      }),
    }

    const inventory = await storageMigrationSourceInventoryRead(overreturning, { sourceBinding })

    expect(inventory).toEqual({ success: true, data: [] })
  })

  test("fails when source or destination pagination repeats a continuation token", async () => {
    let sourceCalls = 0
    const sourceAdapter = memoryStorageAdapterCreate()
    const repeatingSource: StorageAdapter = {
      ...sourceAdapter,
      listObjects: async () => {
        sourceCalls += 1
        return { success: true, data: { objects: [], nextContinuationToken: "repeat" } }
      },
    }
    const sourceInventory = await storageMigrationSourceInventoryRead(repeatingSource, { sourceBinding })

    let destinationCalls = 0
    const destinationAdapter = memoryStorageAdapterCreate()
    const repeatingDestination: StorageAdapter = {
      ...destinationAdapter,
      listObjects: async () => {
        destinationCalls += 1
        return { success: true, data: { objects: [], nextContinuationToken: "repeat" } }
      },
    }
    const destinationVerification = await storageMigrationDestinationInventoryVerify(repeatingDestination, {
      sourceBinding,
      targetBinding,
      inventory: [],
    })

    expect(sourceInventory).toMatchObject({ success: false })
    expect(destinationVerification).toMatchObject({ success: false })
    expect(sourceCalls).toBe(2)
    expect(destinationCalls).toBe(2)
  })

  test("maps every namespace exactly, including bucket-root prefixes", () => {
    const source = { ...sourceBinding, prefix: "" }
    const target = { ...targetBinding, prefix: "target" }
    const expected = [
      ["private-staging", "uploads/item"],
      ["private-source", "sources/item"],
      ["public-output", "images/item_v1.png"],
    ] as const

    for (const [namespace, key] of expected) {
      const mapped = storageMigrationObjectLocationCreate({
        sourceBinding: source,
        targetBinding: target,
        namespace,
        key,
      })
      expect(mapped).toMatchObject({ success: true })
      if (!mapped.success) continue
      expect(mapped.data.source.objectKey).toBe(
        `${namespace === "private-staging" ? "private/staging" : namespace === "private-source" ? "private/source" : "public"}/${key}`,
      )
      expect(mapped.data.destination.objectKey).toBe(
        `target/${namespace === "private-staging" ? "private/staging" : namespace === "private-source" ? "private/source" : "public"}/${key}`,
      )
    }
  })

  test("copies immutably, accepts identical destinations, rejects collisions, and leaves sources intact", async () => {
    const adapter = memoryStorageAdapterCreate()
    let deleteCalls = 0
    const noDeleteAdapter: StorageAdapter = {
      ...adapter,
      deleteObject: async (location) => {
        deleteCalls += 1
        return adapter.deleteObject(location)
      },
    }
    const sourceLocation = storageLocation(sourceBinding, "private-staging", "uploads/source")
    const destinationLocation = storageLocation(targetBinding, "private-staging", "uploads/source")
    if (!sourceLocation.success || !destinationLocation.success) return
    await storagePutImmutable(adapter, { location: sourceLocation.data, bytes: png, mediaType: "image/png" })
    const inventory = await storageMigrationSourceInventoryRead(adapter, { sourceBinding })
    expect(inventory.success).toBe(true)
    if (!inventory.success) return
    const item = inventory.data.find((candidate) => candidate.key === "uploads/source")
    if (item === undefined) return

    const first = await storageMigrationObjectCopy(noDeleteAdapter, {
      source: item,
      destination: destinationLocation.data,
    })
    const identical = await storageMigrationObjectCopy(noDeleteAdapter, {
      source: item,
      destination: destinationLocation.data,
    })
    expect(first).toMatchObject({ success: true })
    expect(identical).toMatchObject({ success: true })
    expect(deleteCalls).toBe(0)
    expect(await adapter.readObject(sourceLocation.data)).toEqual({ success: true, data: png })

    const collisionAdapter = memoryStorageAdapterCreate()
    const collision = storageLocation(targetBinding, "private-staging", "uploads/source")
    if (!collision.success) return
    await storagePutImmutable(collisionAdapter, { location: sourceLocation.data, bytes: png, mediaType: "image/png" })
    await storagePutImmutable(collisionAdapter, {
      location: collision.data,
      bytes: json,
      mediaType: "application/json",
    })
    expect(
      await storageMigrationObjectCopy(collisionAdapter, { source: item, destination: collision.data }),
    ).toMatchObject({
      success: false,
    })
  })

  test("verifies destination metadata and exact inventory, and detects source changes", async () => {
    const adapter = memoryStorageAdapterCreate()
    const sourceLocation = storageLocation(sourceBinding, "public-output", "images/hero_v1.png")
    if (!sourceLocation.success) return
    await storagePutImmutable(adapter, { location: sourceLocation.data, bytes: png, mediaType: "image/png" })
    const inventory = await storageMigrationSourceInventoryRead(adapter, { sourceBinding })
    expect(inventory.success).toBe(true)
    if (!inventory.success) return
    const item = inventory.data[0]
    if (item === undefined) return
    const mapped = storageMigrationObjectLocationCreate({
      sourceBinding,
      targetBinding,
      namespace: item.namespace,
      key: item.key,
    })
    if (!mapped.success) return
    expect(
      await storageMigrationObjectCopy(adapter, { source: item, destination: mapped.data.destination }),
    ).toMatchObject({
      success: true,
    })
    expect(
      await storageMigrationDestinationInventoryVerify(adapter, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: true, data: { objectCount: 1, totalBytes: png.byteLength } })

    const unknownDestination: StorageObject = {
      key: "archive/project-1/unmanaged/object",
      byteSize: png.byteLength,
    }
    const unknownDestinationAdapter: StorageAdapter = {
      ...adapter,
      listObjects: async (input) => {
        const page = await adapter.listObjects?.(input)
        if (page === undefined) return { success: true, data: { objects: [], nextContinuationToken: null } }
        if (!page.success) return page
        return {
          success: true,
          data: {
            objects: [...page.data.objects, unknownDestination],
            nextContinuationToken: page.data.nextContinuationToken,
          },
        }
      },
    }
    expect(
      await storageMigrationDestinationInventoryVerify(unknownDestinationAdapter, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: false })

    const sibling = storageLocation(
      { ...targetBinding, prefix: "archive/project-10" },
      "public-output",
      "images/sibling_v1.png",
    )
    if (!sibling.success) return
    await storagePutImmutable(adapter, { location: sibling.data, bytes: png, mediaType: "image/png" })
    expect(
      await storageMigrationDestinationInventoryVerify(adapter, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: true })

    const missing = memoryStorageAdapterCreate()
    expect(
      await storageMigrationDestinationInventoryVerify(missing, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: false })

    const wrongMetadata: StorageAdapter = {
      ...adapter,
      headObject: async (location) => {
        const head = await adapter.headObject(location)
        if (head.success && head.data !== null && location.bucket === targetBinding.bucket)
          return { success: true, data: { ...head.data, cacheControl: "no-store" } }
        return head
      },
    }
    expect(
      await storageMigrationDestinationInventoryVerify(wrongMetadata, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: false })

    const missingMetadata: StorageAdapter = {
      ...adapter,
      headObject: async (location) => {
        const head = await adapter.headObject(location)
        if (head.success && head.data !== null && location.bucket === targetBinding.bucket)
          return {
            success: true,
            data: { ...head.data, mediaType: undefined, sha256: undefined, cacheControl: undefined },
          }
        return head
      },
    }
    expect(
      await storageMigrationDestinationInventoryVerify(missingMetadata, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: false })

    const extra = storageLocation(targetBinding, "public-output", "images/extra_v1.png")
    if (!extra.success) return
    await storagePutImmutable(adapter, { location: extra.data, bytes: png, mediaType: "image/png" })
    expect(
      await storageMigrationDestinationInventoryVerify(adapter, {
        sourceBinding,
        targetBinding,
        inventory: inventory.data,
      }),
    ).toMatchObject({ success: false })

    const unstableBase = memoryStorageAdapterCreate()
    await storagePutImmutable(unstableBase, { location: sourceLocation.data, bytes: png, mediaType: "image/png" })
    const unstable: StorageAdapter = {
      ...unstableBase,
      copyImmutable: async (input) => {
        const copied = await unstableBase.copyImmutable(input)
        await unstableBase.deleteObject(input.source)
        return copied
      },
    }
    expect(
      await storageMigrationObjectCopy(unstable, { source: item, destination: mapped.data.destination }),
    ).toMatchObject({
      success: false,
    })
  })

  test("uses a conditional server-side copy between runtime-selected buckets", async () => {
    const checksum = contentSha256Create(png)
    const requests: Array<{ method: string; url: string; headers: Headers }> = []
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (url, init) => {
        const method = init?.method ?? "GET"
        requests.push({ method, url: String(url), headers: new Headers(init?.headers) })
        if (method === "PUT") return new Response(null, { status: 200 })
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
    const mapped = storageMigrationObjectLocationCreate({
      sourceBinding,
      targetBinding,
      namespace: "private-staging",
      key: "uploads/source",
    })
    if (!mapped.success) return
    const copied = await storageCopyImmutable(adapter, {
      source: mapped.data.source,
      destination: mapped.data.destination,
      mediaType: "image/png",
      sha256: checksum,
      sourceEtag: checksum,
    })
    expect(copied).toMatchObject({ success: true })
    expect(requests.map((request) => request.method)).toEqual(["HEAD", "PUT", "HEAD"])
    expect(requests[1]?.url).toContain("/target-bucket/")
    expect(requests[1]?.headers.get("x-amz-copy-source")).toBe(
      "/source-bucket/projects/project-1/private/staging/uploads/source",
    )
    expect(requests[1]?.headers.get("x-amz-copy-source-if-match")).toBe(checksum)
    expect(requests[1]?.headers.get("if-none-match")).toBe("*")
  })

  test("verifies a raced R2 destination before accepting a 412 copy", async () => {
    const checksum = contentSha256Create(png)
    const mapped = storageMigrationObjectLocationCreate({
      sourceBinding,
      targetBinding,
      namespace: "private-staging",
      key: "uploads/source",
    })
    if (!mapped.success) return
    const item = {
      namespace: "private-staging" as const,
      key: "uploads/source",
      location: mapped.data.source,
      object: {
        key: mapped.data.source.objectKey,
        byteSize: png.byteLength,
        mediaType: "image/png",
        sha256: checksum,
        etag: checksum,
        cacheControl: "no-store",
      },
    }
    const methods: string[] = []
    let destinationHeads = 0
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (url, init) => {
        const method = init?.method ?? "GET"
        const isDestination = new URL(String(url)).pathname.includes("/target-bucket/")
        methods.push(method)
        if (method === "PUT") return new Response(null, { status: 412 })
        if (isDestination && method === "HEAD") {
          destinationHeads += 1
          if (destinationHeads === 1) return new Response(null, { status: 404 })
        }
        if (method === "GET") return new Response(png)
        return new Response(null, { status: 200, headers: r2ObjectHeaders(checksum) })
      },
    })

    const copied = await storageMigrationObjectCopy(adapter, { source: item, destination: mapped.data.destination })

    expect(copied).toMatchObject({ success: true, data: { key: mapped.data.destination.objectKey } })
    expect(methods).toEqual(["HEAD", "GET", "HEAD", "HEAD", "PUT", "HEAD", "HEAD", "GET", "HEAD", "HEAD", "GET"])
  })

  test("rejects a raced R2 destination whose content does not match the source", async () => {
    const checksum = contentSha256Create(png)
    const collisionChecksum = contentSha256Create(json)
    const mapped = storageMigrationObjectLocationCreate({
      sourceBinding,
      targetBinding,
      namespace: "private-staging",
      key: "uploads/source",
    })
    if (!mapped.success) return
    const item = {
      namespace: "private-staging" as const,
      key: "uploads/source",
      location: mapped.data.source,
      object: {
        key: mapped.data.source.objectKey,
        byteSize: png.byteLength,
        mediaType: "image/png",
        sha256: checksum,
        etag: checksum,
        cacheControl: "no-store",
      },
    }
    let destinationHeads = 0
    const adapter = r2StorageAdapterCreate({
      accountId: "account",
      accessKeyId: "access",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      fetchImplementation: async (url, init) => {
        const method = init?.method ?? "GET"
        const isDestination = new URL(String(url)).pathname.includes("/target-bucket/")
        if (method === "PUT") return new Response(null, { status: 412 })
        if (isDestination && method === "HEAD") {
          destinationHeads += 1
          if (destinationHeads === 1) return new Response(null, { status: 404 })
          return new Response(null, {
            status: 200,
            headers: r2ObjectHeaders(collisionChecksum, json.byteLength, "application/json"),
          })
        }
        if (method === "GET") return new Response(json)
        return new Response(null, { status: 200, headers: r2ObjectHeaders(checksum) })
      },
    })

    const copied = await storageMigrationObjectCopy(adapter, { source: item, destination: mapped.data.destination })

    expect(copied).toMatchObject({ success: false })
  })
})

function r2ObjectHeaders(checksum: string, byteSize = png.byteLength, mediaType = "image/png"): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-length": String(byteSize),
    "content-type": mediaType,
    etag: checksum,
    "x-amz-meta-sha256": checksum,
  }
}

async function storagePut(
  adapter: StorageAdapter,
  binding: typeof sourceBinding,
  namespace: "private-staging" | "private-source" | "public-output",
  key: string,
  bytes: Uint8Array,
  mediaType: string,
): Promise<void> {
  const location = storageLocation(binding, namespace, key)
  if (!location.success) throw new Error(location.errorMessage)
  const stored = await storagePutImmutable(adapter, { location: location.data, bytes, mediaType })
  if (!stored.success) throw new Error(stored.errorMessage)
}

function storageLocation(
  binding: typeof sourceBinding,
  namespace: "private-staging" | "private-source" | "public-output",
  key: string,
) {
  return storageObjectLocationCreate(
    {
      projectId: binding.projectId,
      environment: binding.environment,
      bucket: binding.bucket,
      prefix: binding.prefix,
      publicBaseUrl: binding.publicBaseUrl,
    },
    namespace,
    key,
  )
}
