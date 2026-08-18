import { describe, expect, test } from "bun:test"

import { apiAppCreate } from "../src/api/apiAppCreate.js"
import type { ApiAppOptions } from "../src/api/apiAppOptions.js"
import type { AssetApiRepository } from "../src/asset/assetApiRepository.js"
import { memoryPkceStateStoreCreate } from "../src/authentication/memoryPkceStateStoreCreate.js"
import { memorySessionStoreCreate } from "../src/authentication/memorySessionStoreCreate.js"
import { sessionCookieCreate } from "../src/authentication/sessionCookieCreate.js"
import type { AuthenticationSession } from "../src/authentication/sessionSchema.js"
import type { DeletionApiRepository } from "../src/deletion/deletionApiRepository.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
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

const projectRepositoryCreate = (): ProjectRepository => ({
  projectsRead: () => ({ success: true, data: [project] }),
  projectRead: (identifier) => ({
    success: true,
    data: identifier === "project-service" || identifier === "project-1" ? project : null,
  }),
  projectBindingRead: (identifier) => ({ success: true, data: identifier === "project-service" ? binding : null }),
  environmentsRead: () => ({ success: true, data: [environment] }),
  environmentRead: () => ({ success: true, data: environment }),
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

const optionsCreate = (): ApiAppOptions => {
  lastUploaderId = undefined
  const sessionStore = memorySessionStoreCreate({ sessionIdCreate: () => "session-1" })
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
})
