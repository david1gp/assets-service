import { apiAppCreate } from "../api/apiAppCreate.js"
import { assetApiRepositoryCreate } from "../asset/assetApiRepositoryCreate.js"
import { auditApiRepositoryCreate } from "../audit/auditApiRepositoryCreate.js"
import { databasePkceStateStoreCreate } from "../authentication/databasePkceStateStoreCreate.js"
import { databaseSessionStoreCreate } from "../authentication/databaseSessionStoreCreate.js"
import { backupApiRepositoryCreate } from "../backup/backupApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../catalog/catalogApiRepositoryCreate.js"
import type { ServiceRuntimeConfig } from "../config/serviceRuntimeConfig.js"
import { deletionApiRepositoryCreate } from "../deletion/deletionApiRepositoryCreate.js"
import { legacyImportExecutorCreate } from "../import/legacyImportExecutorCreate.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { zitadelJwksClientCreate } from "../infrastructure/zitadel/zitadelJwksClientCreate.js"
import { zitadelOidcClientCreate } from "../infrastructure/zitadel/zitadelOidcClientCreate.js"
import { projectRepositoryCreate } from "../project/projectRepositoryCreate.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadApiRepositoryCreate } from "../upload/uploadApiRepositoryCreate.js"
import { workflowApiRepositoryCreate } from "../workflow/workflowApiRepositoryCreate.js"
import type { ApiComposition } from "./apiComposition.js"

export const apiCompositionCreate = (config: ServiceRuntimeConfig): Result<ApiComposition> => {
  const connection = databaseOpen(config.service.databasePath)
  if (!connection.success) return connection
  const migrated = databaseMigrate(connection.data)
  if (!migrated.success) {
    databaseClose(connection.data)
    return migrated
  }

  const sessionStore = databaseSessionStoreCreate(connection.data)
  if (!sessionStore.success) {
    databaseClose(connection.data)
    return sessionStore
  }
  const stateStore = databasePkceStateStoreCreate(connection.data)
  if (!stateStore.success) {
    databaseClose(connection.data)
    return stateStore
  }
  const projectRepository = projectRepositoryCreate(connection.data.db)
  const allowedBuckets = [
    config.service.r2Bucket,
    config.service.r2PrivateBucket,
    config.service.r2PublicBucket,
    config.service.r2DevelopmentBucket,
    config.service.r2ProductionBucket,
  ].filter((bucket): bucket is string => bucket !== undefined)
  const storage = r2StorageAdapterCreate({
    accountId: config.service.r2AccountId,
    accessKeyId: config.service.r2AccessKeyId,
    secretAccessKey: config.service.r2SecretAccessKey,
    endpoint: config.service.r2Endpoint,
    allowedBuckets,
  })
  const assetApiRepository = assetApiRepositoryCreate(connection.data.db)
  const uploadApiRepository = uploadApiRepositoryCreate(connection.data.db, storage)
  const deletionApiRepository = deletionApiRepositoryCreate(connection.data.db)
  const workflowApiRepository = workflowApiRepositoryCreate(connection.data.db)
  const backupApiRepository = backupApiRepositoryCreate(connection.data.db)
  const catalogApiRepository = catalogApiRepositoryCreate(connection.data.db)
  const auditApiRepository = auditApiRepositoryCreate(connection.data.db)
  const legacyImportExecutor = legacyImportExecutorCreate({
    db: connection.data.db,
    storage,
    sourceRoots: config.service.legacyImportRoots,
  })
  const oidcClient = zitadelOidcClientCreate({ config: config.zitadel })
  const jwksClient = zitadelJwksClientCreate({ ttlSeconds: config.zitadel.jwksCacheTtlSeconds })
  const serviceBearer = config.zitadel.serviceAccountClientId
    ? {
        issuer: config.zitadel.issuer,
        audience: config.zitadel.audience,
        jwksClient,
        discoveryRead: oidcClient.discoveryRead,
        organizationId: config.zitadel.organizationId,
        serviceAccountClientId: config.zitadel.serviceAccountClientId,
        defaultProjectId: config.zitadel.projectId,
        now: undefined,
        clockSkewSeconds: config.zitadel.clockSkewSeconds,
      }
    : undefined

  const app = apiAppCreate({
    projectRepository,
    assetApiRepository,
    storage,
    uploadApiRepository,
    deletionApiRepository,
    workflowApiRepository,
    backupApiRepository,
    catalogApiRepository,
    auditApiRepository,
    legacyImportExecutor,
    authentication: {
      config: config.zitadel,
      stateStore: stateStore.data,
      sessionStore: sessionStore.data,
      oidcClient,
      jwksClient,
      serviceBearer,
    },
    readinessCheck: () => {
      try {
        connection.data.client.query("SELECT 1").get()
        return { success: true, data: true }
      } catch (error) {
        return resultErrorCreate("apiReadinessCheck", "The database was not ready", error)
      }
    },
  })
  return { success: true, data: { app, connection: connection.data } }
}
