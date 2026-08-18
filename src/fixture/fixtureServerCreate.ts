import { apiAppCreate } from "../api/apiAppCreate.js"
import { assetApiRepositoryCreate } from "../asset/assetApiRepositoryCreate.js"
import { auditApiRepositoryCreate } from "../audit/auditApiRepositoryCreate.js"
import { backupApiRepositoryCreate } from "../backup/backupApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../catalog/catalogApiRepositoryCreate.js"
import { deletionApiRepositoryCreate } from "../deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { legacyImportExecutorCreate } from "../import/legacyImportExecutorCreate.js"
import { memoryStorageAdapterCreate } from "../infrastructure/storage/memoryStorageAdapter.js"
import { projectRepositoryCreate } from "../project/projectRepositoryCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadApiRepositoryCreate } from "../upload/uploadApiRepositoryCreate.js"
import { workflowApiRepositoryCreate } from "../workflow/workflowApiRepositoryCreate.js"
import { fixtureAuthenticationCreate } from "./fixtureAuthenticationCreate.js"
import { fixtureUploadStorageCreate } from "./fixtureUploadStorageCreate.js"
import { fixtureDatabaseSeed, type FixtureSeed } from "./fixtureDatabaseSeed.js"

export type FixtureServer = {
  fetch: (request: Request) => Promise<Response>
  seed: FixtureSeed
  sessionCookieRead: () => Promise<Result<string>>
  close: () => void
}

/**
 * Builds an API application over a freshly seeded database and a local-only
 * session adapter, so the SPA can be driven end to end without Zitadel, R2, or
 * rclone. Only the fixture entrypoint and its tests use this.
 */
export const fixtureServerCreate = (options: { databasePath: string; origin: string }): Result<FixtureServer> => {
  const connection = databaseOpen(options.databasePath)
  if (!connection.success) return connection
  const migrated = databaseMigrate(connection.data)
  if (!migrated.success) {
    databaseClose(connection.data)
    return migrated
  }
  const seeded = fixtureDatabaseSeed(connection.data.db)
  if (!seeded.success) {
    databaseClose(connection.data)
    return seeded
  }

  const authentication = fixtureAuthenticationCreate({
    origin: options.origin,
    subjectId: seeded.data.subjectId,
    projectId: seeded.data.zitadelProjectId,
  })

  const uploadStorage = fixtureUploadStorageCreate({ origin: options.origin })

  const app = apiAppCreate({
    authentication: authentication.options,
    projectRepository: projectRepositoryCreate(connection.data.db),
    assetApiRepository: assetApiRepositoryCreate(connection.data.db),
    uploadApiRepository: uploadApiRepositoryCreate(connection.data.db, uploadStorage.storage),
    deletionApiRepository: deletionApiRepositoryCreate(connection.data.db),
    workflowApiRepository: workflowApiRepositoryCreate(connection.data.db),
    backupApiRepository: backupApiRepositoryCreate(connection.data.db),
    catalogApiRepository: catalogApiRepositoryCreate(connection.data.db),
    auditApiRepository: auditApiRepositoryCreate(connection.data.db),
    legacyImportExecutor: legacyImportExecutorCreate({
      db: connection.data.db,
      storage: memoryStorageAdapterCreate(),
      sourceRoots: [],
    }),
    readinessCheck: () => ({ success: true, data: true }),
  })

  const sessionCookieRead = async (): Promise<Result<string>> => {
    const sessionId = await authentication.sessionCreate()
    if (!sessionId.success) return sessionId
    return {
      success: true,
      data: `${authentication.config.sessionCookieName}=${encodeURIComponent(sessionId.data)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${authentication.config.sessionTtlSeconds}`,
    }
  }

  const fetchHandle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const upload = await uploadStorage.requestHandle(request)
    if (upload !== null) return upload
    if (url.pathname === "/api/v1/auth/login") {
      const cookie = await sessionCookieRead()
      if (!cookie.success)
        return Response.json(
          { ok: false, error: { code: "internal_error", message: cookie.errorMessage, retryable: false } },
          { status: 500 },
        )
      const returnTo = url.searchParams.get("returnTo") ?? "/"
      const headers = new Headers({ "set-cookie": cookie.data })
      if (request.headers.get("accept")?.includes("application/json")) {
        headers.set("content-type", "application/json; charset=UTF-8")
        return new Response(
          JSON.stringify({ ok: true, data: { authorizationUrl: new URL(returnTo, options.origin).toString() } }),
          { status: 200, headers },
        )
      }
      headers.set("location", new URL(returnTo, options.origin).toString())
      return new Response(null, { status: 302, headers })
    }
    return app.fetch(request)
  }

  return {
    success: true,
    data: {
      fetch: fetchHandle,
      seed: seeded.data,
      sessionCookieRead,
      close: () => databaseClose(connection.data),
    },
  }
}
