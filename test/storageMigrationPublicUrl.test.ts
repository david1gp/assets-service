import { describe, expect, test } from "bun:test"

import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { storageMigrationDestinationPublicUrlVerify } from "../src/migration/storageMigrationDestinationPublicUrlVerify.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { resultErrorCreate } from "../src/schemas/resultErrorCreate.js"
import type { StorageAdapter } from "../src/storage/storageAdapter.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import { storagePutImmutable } from "../src/storage/storagePutImmutable.js"

const sourceBinding = {
  projectId: "project-1",
  environmentId: "environment-1",
  environment: "development" as const,
  bucket: "source-bucket",
  prefix: "source-prefix",
  publicBaseUrl: "https://assets.example.test",
}

const targetBinding = {
  ...sourceBinding,
  bucket: "target-bucket",
  prefix: "target-prefix",
  publicBaseUrl: "https://target.example.test",
}

const sourceStorageBinding = {
  projectId: sourceBinding.projectId,
  environment: sourceBinding.environment,
  bucket: sourceBinding.bucket,
  prefix: sourceBinding.prefix,
  publicBaseUrl: sourceBinding.publicBaseUrl,
}

const mediaType = "application/octet-stream"
const cacheControl = "public, max-age=31536000, immutable"

type ProbeMode = "old-bucket" | "root-200" | "redirect" | "content-mismatch" | "target"

function fixtureCreate(mode: ProbeMode, options: { sameUrl?: boolean; cleanupFailure?: boolean } = {}) {
  const storageBase = memoryStorageAdapterCreate()
  let written: Parameters<StorageAdapter["putImmutable"]>[0] | undefined
  const deleted: Array<Parameters<StorageAdapter["deleteObject"]>[0]> = []
  const storage: StorageAdapter = {
    ...storageBase,
    putImmutable: async (input) => {
      written = input
      return storageBase.putImmutable(input)
    },
    deleteObject: async (location) => {
      deleted.push(location)
      if (options.cleanupFailure) return resultErrorCreate("testProbeCleanup", "delete failed")
      return storageBase.deleteObject(location)
    },
  }
  const publicBaseUrl = options.sameUrl ? sourceBinding.publicBaseUrl : targetBinding.publicBaseUrl
  const target = { ...targetBinding, publicBaseUrl }
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImplementation = async (request: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = request instanceof Request ? request.url : request.toString()
    fetchCalls.push({ url, init })
    if (mode === "redirect") return new Response(null, { status: 302, headers: { location: publicBaseUrl } })
    if (mode === "old-bucket")
      return probeResponse(new TextEncoder().encode("old-bucket-object"), mediaType, cacheControl)
    if (mode === "root-200")
      return probeResponse(new TextEncoder().encode("unrelated-root-object"), mediaType, cacheControl)
    if (mode === "content-mismatch")
      return probeResponse(new TextEncoder().encode("different-object"), mediaType, cacheControl)
    if (written === undefined) return new Response(null, { status: 404 })
    return probeResponse(written.bytes, mediaType, cacheControl)
  }
  return { storageBase, storage, target, getWritten: () => written, deleted, fetchCalls, fetchImplementation }
}

describe("storage migration public URL verification", () => {
  test("rejects an unchanged URL still serving the old bucket", async () => {
    const fixture = fixtureCreate("old-bucket", { sameUrl: true })
    const result = await verify(fixture)

    expect(result).toMatchObject({ success: false, retryable: false })
    expect(!result.success && result.errorMessage).toContain("Public URL conflict")
    expect(fixture.deleted).toHaveLength(1)
    expect(fixture.deleted[0]).toMatchObject({
      bucket: targetBinding.bucket,
      namespace: "public-output",
    })
    expect(fixture.deleted[0]?.objectKey).toContain("target-prefix/public/__migration_probe/")
  })

  test("rejects an unrelated root 200 response", async () => {
    const fixture = fixtureCreate("root-200")
    const result = await verify(fixture)

    expect(result).toMatchObject({ success: false })
    expect(!result.success && result.errorMessage).toContain("did not match")
    expect(fixture.fetchCalls[0]?.url).not.toBe(fixture.target.publicBaseUrl)
  })

  test("rejects redirects without following them", async () => {
    const fixture = fixtureCreate("redirect")
    const result = await verify(fixture)

    expect(result).toMatchObject({ success: false })
    expect(!result.success && result.errorMessage).toContain("redirect")
    expect(fixture.fetchCalls[0]?.init).toMatchObject({ method: "GET", redirect: "manual" })
  })

  test("rejects a public response with mismatched content", async () => {
    const fixture = fixtureCreate("content-mismatch")
    const result = await verify(fixture)

    expect(result).toMatchObject({ success: false })
    expect(!result.success && result.errorMessage).toContain("did not match")
  })

  test("verifies the target probe and removes only that probe", async () => {
    const fixture = fixtureCreate("target")
    const sourceLocation = storageObjectLocationCreate(sourceStorageBinding, "private-source", "source/item")
    expect(sourceLocation).toMatchObject({ success: true })
    if (!sourceLocation.success) return
    await storagePutImmutable(fixture.storageBase, {
      location: sourceLocation.data,
      bytes: new TextEncoder().encode("source-object"),
      mediaType,
    })

    const result = await verify(fixture)

    expect(result).toEqual({ success: true, data: null })
    expect(fixture.getWritten()).toMatchObject({
      location: { bucket: targetBinding.bucket, namespace: "public-output" },
      mediaType,
      sha256: expect.any(String),
    })
    const written = fixture.getWritten()
    if (written === undefined) return
    expect(written.location.objectKey).toContain("target-prefix/public/__migration_probe/")
    expect(written.sha256).toEqual(contentSha256Create(written.bytes))
    expect(fixture.deleted).toHaveLength(1)
    expect(fixture.deleted[0]?.namespace).toBe("public-output")
    expect(fixture.deleted[0]?.bucket).toBe(targetBinding.bucket)
    expect(fixture.deleted[0]?.objectKey).toContain("target-prefix/public/__migration_probe/")
    expect(await fixture.storageBase.headObject(written.location)).toEqual({ success: true, data: null })
    expect(await fixture.storageBase.headObject(sourceLocation.data)).toMatchObject({
      success: true,
      data: { key: sourceLocation.data.objectKey },
    })
  })

  test("fails when probe cleanup fails and leaves the probe for safe recovery", async () => {
    const fixture = fixtureCreate("target", { cleanupFailure: true })
    const result = await verify(fixture)

    expect(result).toMatchObject({ success: false, retryable: false })
    expect(!result.success && result.errorMessage).toContain("probe cleanup failed")
    expect(fixture.deleted).toHaveLength(1)
    expect(fixture.deleted[0]?.namespace).toBe("public-output")
    expect(fixture.deleted[0]?.bucket).toBe(targetBinding.bucket)
    const written = fixture.getWritten()
    if (written === undefined) return
    expect(await fixture.storageBase.headObject(written.location)).toMatchObject({ success: true, data: {} })
  })
})

async function verify(fixture: ReturnType<typeof fixtureCreate>) {
  return storageMigrationDestinationPublicUrlVerify({
    storage: fixture.storage,
    sourceBinding,
    targetBinding: fixture.target,
    fetchImplementation: fixture.fetchImplementation,
    randomUUID: () => "probe-test-id",
  })
}

function probeResponse(bytes: Uint8Array, responseMediaType: string, responseCacheControl: string): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "cache-control": responseCacheControl,
      "content-type": responseMediaType,
      etag: contentSha256Create(bytes),
    },
  })
}
