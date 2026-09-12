import { expect, test } from "bun:test"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { r2BucketStorageAdapterCreate } from "../src/infrastructure/storage/r2BucketStorageAdapterCreate.js"
import type { R2BucketCredentialRepository } from "../src/r2/r2BucketCredentialRepository.js"
import { r2BucketCredentialRepositoryCreate } from "../src/r2/r2BucketCredentialRepositoryCreate.js"

const location = {
  binding: {
    projectId: "project-1",
    environment: "production" as const,
    bucket: "project-bucket",
    prefix: "projects/project-1",
    publicBaseUrl: "https://assets.example.test",
  },
  namespace: "private-source" as const,
  key: "source.png",
  bucket: "project-bucket",
  objectKey: "projects/project-1/private/source/source.png",
}

test("resolves persisted credentials and uses one bootstrap credential across buckets", async () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return
  try {
    expect(databaseMigrate(opened.data)).toEqual({ success: true, data: null })
    const repository = r2BucketCredentialRepositoryCreate(opened.data.db, { encryptionKey: "master-key" })
    const requests: RequestInit[] = []
    const storage = r2BucketStorageAdapterCreate({
      accountId: "account-1",
      endpoint: "https://account.r2.cloudflarestorage.com",
      credentialRepository: repository,
      bootstrapCredential: {
        accessKeyId: "legacy-access",
        secretAccessKey: "legacy-secret",
      },
      fetchImplementation: async (_input, init) => {
        requests.push(init ?? {})
        return new Response(null, { status: 404 })
      },
    })

    expect(await storage.headObject(location)).toEqual({ success: true, data: null })
    expect(await storage.headObject(location)).toEqual({ success: true, data: null })
    const persisted = repository.r2BucketCredentialRead("project-bucket")
    expect(persisted).toEqual({ success: true, data: null })
    expect(await storage.headObject({ ...location, bucket: "another-bucket", objectKey: "source.png" })).toEqual({
      success: true,
      data: null,
    })
    expect(repository.r2BucketCredentialsRead()).toEqual({ success: true, data: [] })
    expect(requests).toHaveLength(3)
    expect(new Headers(requests[0]?.headers).get("authorization")).toContain("Credential=legacy-access/")
    expect(new Headers(requests[2]?.headers).get("authorization")).toContain("Credential=legacy-access/")

    const scoped = repository.r2BucketCredentialCreate({
      bucket: "scoped-bucket",
      accessKeyId: "scoped-access",
      secretAccessKey: "scoped-secret",
      revocationId: "scoped-access",
    })
    expect(scoped.success).toBe(true)
    const scopedStorage = r2BucketStorageAdapterCreate({
      accountId: "account-1",
      endpoint: "https://account.r2.cloudflarestorage.com",
      credentialRepository: repository,
      bootstrapCredential: {
        accessKeyId: "legacy-access",
        secretAccessKey: "legacy-secret",
      },
      fetchImplementation: async (_input, init) => {
        requests.push(init ?? {})
        return new Response(null, { status: 404 })
      },
    })
    await scopedStorage.headObject({ ...location, bucket: "scoped-bucket", objectKey: "source.png" })
    expect(new Headers(requests[3]?.headers).get("authorization")).toContain("Credential=scoped-access/")
  } finally {
    databaseClose(opened.data)
  }
})

test("does not persist the bootstrap credential", async () => {
  let createCalls = 0
  const repository: R2BucketCredentialRepository = {
    r2BucketCredentialRead: () => ({ success: true, data: null }),
    r2BucketCredentialCreate: (input) => {
      createCalls += 1
      return {
        success: true,
        data: {
          ...input,
          createdAt: "2026-09-12T00:00:00.000Z",
          updatedAt: "2026-09-12T00:00:00.000Z",
        },
      }
    },
    r2BucketCredentialsRead: () => ({ success: true, data: [] }),
    r2BucketCredentialDelete: () => ({ success: true, data: false }),
  }
  const storage = r2BucketStorageAdapterCreate({
    accountId: "account-1",
    endpoint: "https://account.r2.cloudflarestorage.com",
    credentialRepository: repository,
    bootstrapCredential: {
      accessKeyId: "legacy-access",
      secretAccessKey: "legacy-secret",
    },
    fetchImplementation: async () => new Response(null, { status: 404 }),
  })

  expect(await storage.headObject(location)).toEqual({ success: true, data: null })
  expect(await storage.headObject({ ...location, bucket: "another-bucket", objectKey: "source.png" })).toEqual({
    success: true,
    data: null,
  })
  expect(createCalls).toBe(0)
})
