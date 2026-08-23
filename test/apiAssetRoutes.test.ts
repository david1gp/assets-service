import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import type { AssetApiRepository } from "../src/asset/assetApiRepository.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { DeletionApiRepository } from "../src/deletion/deletionApiRepository.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { UploadApiRepository } from "../src/upload/uploadApiRepository.js"

const now = 1_700_000_000
let lastUploaderId: string | undefined
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Example",
  slug: "example",
  defaultEnvironment: "development" as const,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const binding = {
  id: "binding-1",
  projectId: "project-1",
  organizationId: "org-1",
  zitadelProjectId: "zitadel-1",
  serviceProjectId: "project-service",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const environment = {
  id: "environment-1",
  projectId: "project-1",
  name: "development" as const,
  r2Bucket: "assets-development",
  r2Prefix: "project-service",
  publicBaseUrl: "https://assets.example.test",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const sourceEnvironment = {
  ...environment,
  id: "environment-2",
  name: "production" as const,
  r2Bucket: "assets-production",
  r2Prefix: "project-service-production",
  publicBaseUrl: "https://assets-production.example.test",
}
const source = {
  id: "source-1",
  assetId: "asset-1",
  revision: 1,
  class: "image" as const,
  originalFilename: "hero.jpg",
  mediaType: "image/jpeg",
  byteSize: 10,
  sha256: "a".repeat(64),
  objectKey: "sources/asset-1/hero.jpg",
  createdAt: "2026-08-17T00:00:00.000Z",
}
const asset = {
  id: "asset-1",
  projectId: "project-1",
  class: "image" as const,
  folders: ["home"],
  filename: "hero.jpg",
  basename: "hero",
  currentSourceRevisionId: "source-1",
  integrationNote: "Hero",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const detail = {
  ...asset,
  sourcePath: "home/hero.jpg",
  sourceHistory: [source],
  outputHistory: [],
  metadata: null,
}
const outputDefinition = {
  id: "output-1",
  assetId: "asset-1",
  kind: "image" as const,
  key: "1600x900_webp",
  width: 1600,
  height: 900,
  format: "webp" as const,
  quality: 82,
  showAiLabel: true,
}
const outputVersion = {
  id: "version-output-1",
  outputDefinitionId: outputDefinition.id,
  assetId: "asset-1",
  sourceRevisionId: "source-1",
  version: 1,
  byteSize: 10,
  sha256: "b".repeat(64),
  mediaType: "image/webp",
  extension: "webp" as const,
  objectKey: "images/hero_v1.webp",
  toolchainVersion: "fixture-1",
  width: 1600,
  height: 900,
  current: true,
  createdAt: "2026-08-17T00:00:00.000Z",
}

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [project] }),
  projectRead: (identifier) => ({
    success: true,
    data: identifier === "project-service" || identifier === "project-1" ? project : null,
  }),
  projectBindingRead: (identifier) => ({ success: true, data: identifier === "project-service" ? binding : null }),
  environmentsRead: () => ({ success: true, data: [environment] }),
  environmentRead: (_projectId, environmentIdentifier) => ({
    success: true,
    data: environmentIdentifier === sourceEnvironment.name ? sourceEnvironment : environment,
  }),
  projectSettingsRead: () => ({
    success: true,
    data: { project, organization: null, binding, environments: [environment] },
  }),
  projectSettingsWrite: (_identifier, update) => ({
    success: true,
    data: {
      project: { ...project, name: update.name, defaultEnvironment: update.defaultEnvironment },
      organization: null,
      binding: { ...binding, ...update.binding },
      environments: update.environments.map((entry, index) => ({
        ...environment,
        id: `environment-${index + 1}`,
        ...entry,
      })),
    },
  }),
  organizationRead: () => ({ success: true, data: null }),
})

const assetRepositoryCreate = (): AssetApiRepository => ({
  assetsRead: () => ({ success: true, data: [{ ...asset, sourcePath: "home/hero.jpg", outputCount: 0 }] }),
  assetRead: () => ({ success: true, data: detail }),
  assetSourceEnvironmentRead: () => ({ success: true, data: "production" }),
  assetOutputBlobRead: () => ({ success: true, data: null }),
  assetOutputsRead: () => ({ success: true, data: [] }),
  assetOutputAdd: () => ({ success: true, data: { asset: detail, workflowId: "workflow-output-1" } }),
  assetOutputRemove: () => ({ success: true, data: { asset: detail, workflowId: "workflow-output-1" } }),
  assetOutputsSet: () => ({ success: true, data: { asset: detail, workflowId: "workflow-output-1" } }),
  assetMetadataSet: () => ({ success: true, data: { asset: detail } }),
  assetMetadataUnset: () => ({ success: true, data: { asset: detail } }),
  assetMove: () => ({ success: true, data: asset }),
})

const uploadRepositoryCreate = (): UploadApiRepository => ({
  uploadIntentCreate: async (_projectId, _environment, _input, uploaderId) => {
    lastUploaderId = uploaderId
    return {
      success: true,
      data: {
        uploadId: "upload-1",
        status: "pending",
        intent: {
          method: "PUT",
          url: "https://upload.example.test/upload-1",
          key: "project-service/private/staging/uploads/upload-1",
          expiresAt: "2026-08-17T00:10:00.000Z",
          headers: { "content-length": "10", "content-type": "image/jpeg" },
          mediaType: "image/jpeg",
          byteSize: 10,
        },
      },
    }
  },
  uploadCompletionComplete: async () => ({
    success: true,
    data: {
      uploadId: "upload-1",
      assetId: "asset-1",
      sourceRevisionId: "source-1",
      workflowId: "workflow-upload-1",
      status: "accepted",
    },
  }),
})

const deletionRepositoryCreate = (): DeletionApiRepository => ({
  deletionRequestEnqueue: () => ({
    success: true,
    data: { deletionId: "deletion-1", workflowId: "workflow-deletion-1", status: "requested" },
  }),
})

const optionsCreate = (sessionId = "session-1"): ApiAppOptions => {
  lastUploaderId = undefined
  const sessionStore = memorySessionStoreCreate({ sessionIdCreate: () => sessionId })
  const stateStore = memoryPkceStateStoreCreate({ now: () => now * 1000 })
  const authenticationConfig = {
    issuer: "https://zitadel.example.test",
    clientId: "human-client-1",
    redirectUri: "https://assets.example.test/api/v1/auth/callback",
    audience: "assets-api",
    organizationId: "org-1",
    projectId: "zitadel-1",
    sessionCookieName: "assets_session",
    stateCookieName: "assets_state",
    sessionTtlSeconds: 3600,
    sessionRotationSeconds: 60,
    clockSkewSeconds: 0,
    jwksCacheTtlSeconds: 60,
  }
  const oidcClient = {
    discoveryRead: async () => ({
      success: true as const,
      data: {
        issuer: authenticationConfig.issuer,
        authorization_endpoint: "https://zitadel.example.test/authorize",
        token_endpoint: "https://zitadel.example.test/token",
        jwks_uri: "https://zitadel.example.test/keys",
      },
    }),
    authorizationUrlCreate: async () => ({ success: true as const, data: "https://zitadel.example.test/authorize" }),
    authorizationCodeExchange: async () => ({
      success: true as const,
      data: { access_token: "token", token_type: "Bearer", expires_in: 600 },
    }),
  }
  return {
    authentication: {
      config: authenticationConfig,
      stateStore,
      sessionStore,
      oidcClient,
      jwksClient: { keysRead: async () => ({ success: true as const, data: [] }) },
      serviceBearer: undefined,
      now: () => now * 1000,
    },
    projectRepository: projectRepositoryCreate(),
    assetApiRepository: assetRepositoryCreate(),
    storage: memoryStorageAdapterCreate(),
    uploadApiRepository: uploadRepositoryCreate(),
    deletionApiRepository: deletionRepositoryCreate(),
    requestIdCreate: () => "request-assets-1",
  }
}

const sessionCookieRead = async (options: ApiAppOptions, role: "assets.uploader" | "assets.admin") => {
  const session: AuthenticationSession = {
    principal: {
      subjectId: "human-1",
      organizationId: "org-1",
      method: "human_session",
      grants: [{ projectId: "zitadel-1", roles: [role] }],
      issuedAt: now - 60,
      expiresAt: now + 600,
    },
    createdAt: now - 60,
    expiresAt: now + 600,
    rotateAt: now + 600,
  }
  const created = await options.authentication.sessionStore.create(session)
  if (!created.success) throw new Error(created.errorMessage)
  return sessionCookieCreate(created.data, { name: "assets_session", maxAgeSeconds: 600 })
}

const requestCreate = (path: string, cookie: string, init: RequestInit = {}) =>
  new Request(`https://assets.example.test${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) },
  })

describe("asset API routes", () => {
  test("keeps asset reads project-scoped and exposes upload and history operations", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const cookie = await sessionCookieRead(options, "assets.uploader")
    const list = await app.fetch(requestCreate("/api/v1/projects/project-service/assets", cookie))
    const includedList = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets?include=metadata,history&folder=home", cookie),
    )
    const detailResponse = await app.fetch(requestCreate("/api/v1/projects/project-service/assets/asset-1", cookie))
    const history = await app.fetch(requestCreate("/api/v1/projects/project-service/assets/asset-1/history", cookie))
    const intent = await app.fetch(
      requestCreate("/api/v1/projects/project-service/uploads/intent", cookie, {
        method: "POST",
        body: JSON.stringify({
          originalFilename: "hero.jpg",
          folders: ["home"],
          integrationNote: "Hero",
          byteSize: 10,
          mediaType: "image/jpeg",
        }),
      }),
    )
    const completion = await app.fetch(
      requestCreate("/api/v1/projects/project-service/uploads/upload-1/complete", cookie, {
        method: "POST",
        body: JSON.stringify({ sha256: "a".repeat(64) }),
      }),
    )
    const otherProject = await app.fetch(requestCreate("/api/v1/projects/other-project/assets", cookie))

    expect(list.status).toBe(200)
    expect(includedList.status).toBe(200)
    expect(detailResponse.status).toBe(200)
    expect(history.status).toBe(200)
    expect(intent.status).toBe(201)
    expect(lastUploaderId).toBe("human-1")
    expect(completion.status).toBe(202)
    expect(otherProject.status).toBe(404)
    expect(((await history.json()) as { data: unknown }).data).toEqual({ sourceHistory: [source], outputHistory: [] })
    expect(
      ((await includedList.json()) as { data: { assets: Array<Record<string, unknown>> } }).data.assets[0],
    ).toMatchObject({
      sourceHistory: [source],
      outputHistory: [],
      metadata: null,
    })
  })

  test("keeps uploader reads separate from administrator mutations", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const uploader = await sessionCookieRead(options, "assets.uploader")
    const denied = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs", uploader, {
        method: "POST",
        body: JSON.stringify({ kind: "image", key: "default", width: 100, height: 100, format: "webp" }),
      }),
    )
    expect(denied.status).toBe(403)

    const adminOptions = optionsCreate()
    const adminApp = apiAppCreate(adminOptions)
    const admin = await sessionCookieRead(adminOptions, "assets.admin")
    const added = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs", admin, {
        method: "POST",
        body: JSON.stringify({ kind: "image", key: "default", width: 100, height: 100, format: "webp" }),
      }),
    )
    const set = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs", admin, {
        method: "PUT",
        body: JSON.stringify({ outputs: [{ kind: "image", key: "default", width: 100, height: 100, format: "webp" }] }),
      }),
    )
    const removed = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs/default", admin, { method: "DELETE" }),
    )
    const metadata = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/metadata", admin, {
        method: "PATCH",
        body: JSON.stringify({ alt: "Hero" }),
      }),
    )
    const metadataUnset = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/metadata/alt", admin, { method: "DELETE" }),
    )
    const moved = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/move", admin, {
        method: "POST",
        body: JSON.stringify({ to: "landing/hero.jpg" }),
      }),
    )
    const deleted = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/deletion-request", admin, {
        method: "POST",
        body: "{}",
      }),
    )

    expect(added.status).toBe(200)
    expect(set.status).toBe(200)
    expect(removed.status).toBe(200)
    expect(metadata.status).toBe(200)
    expect(metadataUnset.status).toBe(200)
    expect(moved.status).toBe(200)
    expect(deleted.status).toBe(202)
    expect(((await deleted.json()) as { data: unknown }).data).toEqual({
      deletionId: "deletion-1",
      workflowId: "workflow-deletion-1",
      status: "requested",
    })
  })

  test("exposes project-scoped structure reads and administrator structure mutations", async () => {
    const folder = {
      id: "structure-folder-1",
      projectId: "project-1",
      parentId: null,
      name: "images",
      depth: 1 as const,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    }
    const membership = {
      id: "membership-1",
      assetId: "asset-1",
      structureFolderId: folder.id,
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    }
    const canonicalAssetBefore = structuredClone(detail)
    const structureProjectIds: string[] = []
    const membershipSets: { projectId: string; assetId: string; structureFolderId: string | null }[] = []
    let canonicalMoveCount = 0
    const structureRepositoryConfigure = (options: ApiAppOptions) => {
      const repository = options.assetApiRepository
      if (repository === undefined) throw new Error("The asset repository was not configured")
      options.assetApiRepository = {
        ...repository,
        structureRead: (projectId) => {
          structureProjectIds.push(projectId)
          return { success: true, data: { folders: [folder], memberships: [membership] } }
        },
        structureFolderCreate: (projectId, input) => {
          structureProjectIds.push(projectId)
          const parentId = input.parentId ?? null
          return {
            success: true,
            data: {
              ...folder,
              id: parentId === null ? "structure-folder-2" : "structure-folder-3",
              name: input.name,
              parentId,
              depth: parentId === null ? (1 as const) : (2 as const),
            },
          }
        },
        assetStructureFolderMembershipSet: (projectId, assetId, structureFolderId) => {
          membershipSets.push({ projectId, assetId, structureFolderId })
          return structureFolderId === null
            ? { success: true, data: null }
            : { success: true, data: { ...membership, structureFolderId } }
        },
        assetMove: (...args) => {
          canonicalMoveCount += 1
          return repository.assetMove(...args)
        },
      }
    }
    const options = optionsCreate("structure-uploader")
    structureRepositoryConfigure(options)
    const app = apiAppCreate(options)
    const uploader = await sessionCookieRead(options, "assets.uploader")
    const structure = await app.fetch(requestCreate("/api/v1/projects/project-service/structure", uploader))
    const denied = await app.fetch(
      requestCreate("/api/v1/projects/project-service/structure/folders", uploader, {
        method: "POST",
        body: JSON.stringify({ name: "new-folder" }),
      }),
    )
    const adminOptions = optionsCreate("structure-admin")
    structureRepositoryConfigure(adminOptions)
    const adminApp = apiAppCreate(adminOptions)
    const admin = await sessionCookieRead(adminOptions, "assets.admin")
    const created = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/structure/folders", admin, {
        method: "POST",
        body: JSON.stringify({ name: "new-folder" }),
      }),
    )
    const nested = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/structure/folders", admin, {
        method: "POST",
        body: JSON.stringify({ name: "nested", parentId: folder.id }),
      }),
    )
    const moved = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/structure-membership", admin, {
        method: "PUT",
        body: JSON.stringify({ structureFolderId: folder.id }),
      }),
    )
    const unassigned = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/structure-membership", admin, {
        method: "PUT",
        body: JSON.stringify({ structureFolderId: null }),
      }),
    )
    const invalid = await adminApp.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/structure-membership", admin, {
        method: "PUT",
        body: JSON.stringify({}),
      }),
    )
    const otherProject = await app.fetch(requestCreate("/api/v1/projects/other-project/structure", uploader))

    expect(structure.status).toBe(200)
    expect(((await structure.json()) as { data: unknown }).data).toEqual({
      folders: [folder],
      memberships: [membership],
    })
    expect(denied.status).toBe(403)
    expect(created.status).toBe(201)
    expect(((await created.json()) as { data: { name: string } }).data.name).toBe("new-folder")
    expect(nested.status).toBe(201)
    expect(((await nested.json()) as { data: { parentId: string; depth: number } }).data).toMatchObject({
      parentId: folder.id,
      depth: 2,
    })
    expect(moved.status).toBe(200)
    expect(unassigned.status).toBe(200)
    expect(((await unassigned.json()) as { data: unknown }).data).toBeNull()
    expect(structureProjectIds).toEqual(["project-1", "project-1", "project-1"])
    expect(membershipSets).toEqual([
      { projectId: "project-1", assetId: "asset-1", structureFolderId: folder.id },
      { projectId: "project-1", assetId: "asset-1", structureFolderId: null },
    ])
    expect(canonicalMoveCount).toBe(0)
    expect(detail).toEqual(canonicalAssetBefore)
    expect(invalid.status).toBe(400)
    expect(otherProject.status).toBe(404)
  })

  test("returns validation envelopes and deterministic method headers", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const admin = await sessionCookieRead(options, "assets.admin")
    const invalid = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs", admin, { method: "POST", body: "{}" }),
    )
    const wrongMethod = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets", admin, { method: "POST" }),
    )

    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({
      ok: false,
      error: { code: "validation_failed", message: "The output definition was invalid", retryable: false },
      requestId: "request-assets-1",
    })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get("allow")).toBe("GET")
  })

  test("uses the source blob environment while streaming only the owned private revision", async () => {
    const options = optionsCreate()
    const app = apiAppCreate(options)
    const unauthenticated = await app.fetch(
      new Request(
        "https://assets.example.test/api/v1/projects/project-service/assets/asset-1/source-revisions/source-1/content",
      ),
    )
    const cookie = await sessionCookieRead(options, "assets.uploader")
    const invalidAsset = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/not valid/source-revisions/source-1/content", cookie),
    )
    const invalidRevision = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/source-revisions/not valid/content", cookie),
    )
    const invalidMode = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/assets/asset-1/source-revisions/source-1/content?mode=inline",
        cookie,
      ),
    )
    const missingRevision = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/source-revisions/source-2/content", cookie),
    )
    const otherProject = await app.fetch(
      requestCreate("/api/v1/projects/other-project/assets/asset-1/source-revisions/source-1/content", cookie),
    )
    const location = storageObjectLocationCreate(
      {
        projectId: "project-1",
        environment: "production",
        bucket: "assets-production",
        prefix: "project-service-production",
        publicBaseUrl: "https://assets-production.example.test",
      },
      "private-source",
      source.objectKey,
    )
    if (!location.success || options.storage === undefined) throw new Error("The test storage location was invalid")
    await options.storage.putImmutable({
      location: location.data,
      bytes: new TextEncoder().encode("0123456789"),
      mediaType: source.mediaType,
    })
    const streamed = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/assets/asset-1/source-revisions/source-1/content?mode=preview",
        cookie,
      ),
    )
    const downloaded = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/assets/asset-1/source-revisions/source-1/content?mode=download",
        cookie,
      ),
    )
    await options.storage.deleteObject(location.data)
    const missingObject = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/source-revisions/source-1/content", cookie),
    )

    expect(unauthenticated.status).toBe(401)
    expect(invalidAsset.status).toBe(400)
    expect(invalidRevision.status).toBe(400)
    expect(invalidMode.status).toBe(400)
    expect(missingRevision.status).toBe(404)
    expect(otherProject.status).toBe(404)
    expect(streamed.status).toBe(200)
    expect(await streamed.text()).toBe("0123456789")
    expect(streamed.headers.get("cache-control")).toBe("private, no-store")
    expect(streamed.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''hero.jpg")
    expect(streamed.headers.get("content-length")).toBe("10")
    expect(streamed.headers.get("content-type")).toBe("image/jpeg")
    expect(streamed.headers.get("x-content-type-options")).toBe("nosniff")
    expect(downloaded.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''hero.jpg")
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff")
    expect(missingObject.status).toBe(404)
  })

  test("uses the public output blob environment while streaming only the owned output version", async () => {
    const options = optionsCreate()
    const repository = options.assetApiRepository
    if (repository === undefined || options.storage === undefined)
      throw new Error("The test repository was not configured")
    options.assetApiRepository = {
      ...repository,
      assetRead: () => ({
        success: true,
        data: { ...detail, outputHistory: [{ definition: outputDefinition, versions: [outputVersion] }] },
      }),
      assetOutputBlobRead: (_projectId, _assetId, outputVersionId) =>
        outputVersionId === outputVersion.id
          ? {
              success: true,
              data: {
                storage: "public",
                environment: "production",
                objectKey: outputVersion.objectKey,
                byteSize: outputVersion.byteSize,
                mediaType: outputVersion.mediaType,
              },
            }
          : { success: true, data: null },
    }
    const app = apiAppCreate(options)
    const unauthenticated = await app.fetch(
      new Request(
        "https://assets.example.test/api/v1/projects/project-service/assets/asset-1/outputs/version-output-1/content",
      ),
    )
    const cookie = await sessionCookieRead(options, "assets.uploader")
    const invalidVersion = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs/not valid/content", cookie),
    )
    const missingVersion = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs/version-output-2/content", cookie),
    )
    const otherProject = await app.fetch(
      requestCreate("/api/v1/projects/other-project/assets/asset-1/outputs/version-output-1/content", cookie),
    )
    const location = storageObjectLocationCreate(
      {
        projectId: "project-1",
        environment: "production",
        bucket: "assets-production",
        prefix: "project-service-production",
        publicBaseUrl: "https://assets-production.example.test",
      },
      "public-output",
      outputVersion.objectKey,
    )
    if (!location.success) throw new Error("The output test storage location was invalid")
    await options.storage.putImmutable({
      location: location.data,
      bytes: new TextEncoder().encode("0123456789"),
      mediaType: outputVersion.mediaType,
    })
    const downloaded = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs/version-output-1/content", cookie),
    )
    await options.storage.deleteObject(location.data)
    const missingObject = await app.fetch(
      requestCreate("/api/v1/projects/project-service/assets/asset-1/outputs/version-output-1/content", cookie),
    )

    expect(unauthenticated.status).toBe(401)
    expect(invalidVersion.status).toBe(400)
    expect(missingVersion.status).toBe(404)
    expect(otherProject.status).toBe(404)
    expect(downloaded.status).toBe(200)
    expect(await downloaded.text()).toBe("0123456789")
    expect(downloaded.headers.get("cache-control")).toBe("private, no-store")
    expect(downloaded.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''1600x900_webp.webp")
    expect(downloaded.headers.get("content-length")).toBe("10")
    expect(downloaded.headers.get("content-type")).toBe("image/webp")
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff")
    expect(missingObject.status).toBe(404)
  })

  test("keeps legacy SVG originals downloadable without allowing inline preview", async () => {
    const options = optionsCreate()
    const repository = options.assetApiRepository
    if (repository === undefined || options.storage === undefined)
      throw new Error("The test repository was not configured")
    const legacySource = {
      ...source,
      id: "source-svg",
      originalFilename: "legacy.svg",
      mediaType: "image/svg+xml",
      objectKey: "sources/asset-1/legacy.svg",
    }
    options.assetApiRepository = {
      ...repository,
      assetRead: () => ({ success: true, data: { ...detail, sourceHistory: [legacySource] } }),
    }
    const app = apiAppCreate(options)
    const cookie = await sessionCookieRead(options, "assets.uploader")
    const location = storageObjectLocationCreate(
      {
        projectId: "project-1",
        environment: "production",
        bucket: "assets-production",
        prefix: "project-service-production",
        publicBaseUrl: "https://assets-production.example.test",
      },
      "private-source",
      legacySource.objectKey,
    )
    if (!location.success) throw new Error("The legacy test storage location was invalid")
    await options.storage.putImmutable({
      location: location.data,
      bytes: new TextEncoder().encode("0123456789"),
      mediaType: legacySource.mediaType,
    })
    const preview = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/assets/asset-1/source-revisions/source-svg/content?mode=preview",
        cookie,
      ),
    )
    const download = await app.fetch(
      requestCreate(
        "/api/v1/projects/project-service/assets/asset-1/source-revisions/source-svg/content?mode=download",
        cookie,
      ),
    )

    expect(preview.status).toBe(200)
    expect(preview.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''legacy.svg")
    expect(download.status).toBe(200)
    expect(download.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''legacy.svg")
    expect(download.headers.get("content-type")).toBe("image/svg+xml")
    expect(download.headers.get("x-content-type-options")).toBe("nosniff")
  })
})
