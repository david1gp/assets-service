import { apiAppCreate } from "../api/apiAppCreate.js"
import { assetApiRepositoryCreate } from "../asset/assetApiRepositoryCreate.js"
import { auditApiRepositoryCreate } from "../audit/auditApiRepositoryCreate.js"
import { backupApiRepositoryCreate } from "../backup/backupApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../catalog/catalogApiRepositoryCreate.js"
import { catalogPublicationServiceCreate } from "../catalog/catalogPublicationServiceCreate.js"
import { deletionApiRepositoryCreate } from "../deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { projectRepositoryCreate } from "../project/projectRepositoryCreate.js"
import type { ProjectArchiveWorkflow } from "../project/projectArchiveWorkflow.js"
import type { ProjectUnarchiveWorkflow } from "../project/projectUnarchiveWorkflow.js"
import { storageMigrationRepositoryCreate } from "../migration/storageMigrationRepositoryCreate.js"
import { storageMigrationWorkflowEnqueue } from "../migration/storageMigrationWorkflowEnqueue.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadApiRepositoryCreate } from "../upload/uploadApiRepositoryCreate.js"
import { workflowApiRepositoryCreate } from "../workflow/workflowApiRepositoryCreate.js"
import type { AuthenticationMode } from "../authentication/authenticationModeSchema.js"
import type { FixtureAccessibleProjectCount } from "./fixtureAccessibleProjectCount.js"
import { fixtureAuthenticationCreate } from "./fixtureAuthenticationCreate.js"
import { type FixtureSeed, fixtureDatabaseSeed } from "./fixtureDatabaseSeed.js"
import { fixtureStorageObjectsCreate } from "./fixtureStorageObjectsCreate.js"
import { fixtureUploadStorageCreate } from "./fixtureUploadStorageCreate.js"

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
export const fixtureServerCreate = (options: {
  databasePath: string
  origin: string
  sessionMode?: AuthenticationMode
  accessibleProjectCount?: FixtureAccessibleProjectCount
  projectArchiveWorkflow?: ProjectArchiveWorkflow
  projectUnarchiveWorkflow?: ProjectUnarchiveWorkflow
}): Result<FixtureServer> => {
  const connection = databaseOpen(options.databasePath)
  if (!connection.success) return connection
  const migrated = databaseMigrate(connection.data)
  if (!migrated.success) {
    databaseClose(connection.data)
    return migrated
  }
  const seeded = fixtureDatabaseSeed(connection.data.db, {
    publicBaseUrl: options.origin,
    accessibleProjectCount: options.accessibleProjectCount,
  })
  if (!seeded.success) {
    databaseClose(connection.data)
    return seeded
  }

  const authentication = fixtureAuthenticationCreate({
    origin: options.origin,
    subjectId: seeded.data.subjectId,
    projectId: seeded.data.zitadelProjectId,
    sessionMode: options.sessionMode,
    accessibleZitadelProjectIds: seeded.data.accessibleZitadelProjectIds,
  })

  const storageObjects = fixtureStorageObjectsCreate(seeded.data, options.origin)
  if (!storageObjects.success) {
    databaseClose(connection.data)
    return storageObjects
  }
  const uploadStorage = fixtureUploadStorageCreate({
    origin: options.origin,
    publicBaseUrl: options.origin,
    objects: storageObjects.data,
  })
  const catalogPublicationService = catalogPublicationServiceCreate(connection.data.db, uploadStorage.storage)

  const app = apiAppCreate({
    authentication: authentication.options,
    projectRepository: projectRepositoryCreate(connection.data.db),
    projectArchiveWorkflow: options.projectArchiveWorkflow,
    projectUnarchiveWorkflow: options.projectUnarchiveWorkflow,
    storageMigrationRepository: storageMigrationRepositoryCreate(connection.data.db),
    storageMigrationWorkflowEnqueue: (input) => storageMigrationWorkflowEnqueue(connection.data.db, input),
    assetApiRepository: assetApiRepositoryCreate(connection.data.db),
    storage: uploadStorage.storage,
    uploadApiRepository: uploadApiRepositoryCreate(connection.data.db, uploadStorage.storage),
    deletionApiRepository: deletionApiRepositoryCreate(connection.data.db),
    workflowApiRepository: workflowApiRepositoryCreate(connection.data.db),
    backupApiRepository: backupApiRepositoryCreate(connection.data.db),
    catalogApiRepository: catalogApiRepositoryCreate(connection.data.db),
    catalogPublicationService,
    auditApiRepository: auditApiRepositoryCreate(connection.data.db),
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
