import { apiAppCreate } from "../api/apiAppCreate.js"
import { assetApiRepositoryCreate } from "../asset/assetApiRepositoryCreate.js"
import { auditApiRepositoryCreate } from "../audit/auditApiRepositoryCreate.js"
import { databasePkceStateStoreCreate } from "../authentication/databasePkceStateStoreCreate.js"
import { databaseSessionStoreCreate } from "../authentication/databaseSessionStoreCreate.js"
import { zitadelOrganizationContextCreate } from "../authentication/zitadelOrganizationContextCreate.js"
import { backupApiRepositoryCreate } from "../backup/backupApiRepositoryCreate.js"
import { catalogApiRepositoryCreate } from "../catalog/catalogApiRepositoryCreate.js"
import { catalogPublicationServiceCreate } from "../catalog/catalogPublicationServiceCreate.js"
import type { ServiceRuntimeConfig } from "../config/serviceRuntimeConfig.js"
import { deletionApiRepositoryCreate } from "../deletion/deletionApiRepositoryCreate.js"
import { databaseClose } from "../infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../infrastructure/db/databaseOpen.js"
import { rcloneBackupRestoreAdapterProduction } from "../infrastructure/rclone/rcloneBackupRestoreAdapterProduction.js"
import { r2BucketStorageAdapterCreate } from "../infrastructure/storage/r2BucketStorageAdapterCreate.js"
import { zitadelJwksClientCreate } from "../infrastructure/zitadel/zitadelJwksClientCreate.js"
import { zitadelOidcClientCreate } from "../infrastructure/zitadel/zitadelOidcClientCreate.js"
import { storageMigrationRepositoryCreate } from "../migration/storageMigrationRepositoryCreate.js"
import { storageMigrationWorkflowEnqueue } from "../migration/storageMigrationWorkflowEnqueue.js"
import { projectArchiveWorkflowCreate } from "../project/projectArchiveWorkflowCreate.js"
import { projectRepositoryCreate } from "../project/projectRepositoryCreate.js"
import { projectStorageDomainRepositoryCreate } from "../project/projectStorageDomainRepositoryCreate.js"
import { projectUnarchiveWorkflowCreate } from "../project/projectUnarchiveWorkflowCreate.js"
import { r2BucketCredentialRepositoryCreate } from "../r2/r2BucketCredentialRepositoryCreate.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { uploadApiRepositoryCreate } from "../upload/uploadApiRepositoryCreate.js"
import { workflowApiRepositoryCreate } from "../workflow/workflowApiRepositoryCreate.js"
import { wranglerCommandRunnerProduction } from "../wrangler/wranglerCommandRunnerProduction.js"
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
  const storageMigrationRepository = storageMigrationRepositoryCreate(connection.data.db)
  const credentialRepository = r2BucketCredentialRepositoryCreate(connection.data.db, {
    encryptionKey: config.service.r2CredentialEncryptionKey,
  })
  const storageDomainRepository = projectStorageDomainRepositoryCreate(connection.data.db)
  const storage = r2BucketStorageAdapterCreate({
    accountId: config.service.r2AccountId,
    endpoint: config.service.r2Endpoint,
    credentialRepository,
    bootstrapCredential: {
      accessKeyId: config.service.r2AccessKeyId,
      secretAccessKey: config.service.r2SecretAccessKey,
    },
  })
  const assetApiRepository = assetApiRepositoryCreate(connection.data.db)
  const uploadApiRepository = uploadApiRepositoryCreate(connection.data.db, storage)
  const deletionApiRepository = deletionApiRepositoryCreate(connection.data.db)
  const workflowApiRepository = workflowApiRepositoryCreate(connection.data.db)
  const backupApiRepository = backupApiRepositoryCreate(connection.data.db)
  const catalogApiRepository = catalogApiRepositoryCreate(connection.data.db)
  const catalogPublicationService = catalogPublicationServiceCreate(connection.data.db, storage)
  const auditApiRepository = auditApiRepositoryCreate(connection.data.db)
  const wranglerRunner = wranglerCommandRunnerProduction
  const restore = rcloneBackupRestoreAdapterProduction(config.service)
  const storageBindingsRead = () =>
    projectRepository.storageBindingsRead?.() ?? {
      success: false as const,
      op: "apiCompositionStorageBindingsRead",
      errorMessage: "Storage binding reads are not configured",
    }
  const projectArchiveWorkflow = projectArchiveWorkflowCreate({
    projectRepository,
    assetApiRepository,
    backupApiRepository,
    restore,
    storage,
    storageBindingsRead,
    wranglerRunner,
    projectStorageDomainRepository: storageDomainRepository,
    r2BucketCredentialRepository: credentialRepository,
  })
  const projectUnarchiveWorkflow = projectUnarchiveWorkflowCreate({
    projectRepository,
    assetApiRepository,
    backupApiRepository,
    restore,
    storage,
    storageBindingsRead,
    wranglerRunner,
    workflowApiRepository,
    projectStorageDomainRepository: storageDomainRepository,
    r2BucketCredentialRepository: credentialRepository,
  })
  const oidcClient = zitadelOidcClientCreate({ config: config.zitadel })
  const jwksClient = zitadelJwksClientCreate({ ttlSeconds: config.zitadel.jwksCacheTtlSeconds })
  const organizationContext = zitadelOrganizationContextCreate(
    config.zitadel.organizationMappings ?? [
      {
        ownerOrganizationId: config.zitadel.organizationId,
        customerOrganizationId: config.zitadel.customerOrganizationId,
      },
    ],
  )
  const serviceBearer =
    config.zitadel.serviceAccountClientId ||
    config.zitadel.projectProvisionerSubjectId ||
    (config.zitadel.projectProvisionerSubjectIds?.length ?? 0) > 0
      ? {
          issuer: config.zitadel.issuer,
          audience: config.zitadel.audience,
          jwksClient,
          discoveryRead: oidcClient.discoveryRead,
          organizationId: config.zitadel.organizationId,
          allowedOrganizationIds: organizationContext.ownerOrganizationIds,
          ownerOrganizationIds: organizationContext.ownerOrganizationIds,
          customerOrganizationIds: organizationContext.customerOrganizationIds,
          serviceAccountClientId: config.zitadel.serviceAccountClientId,
          defaultProjectId: config.zitadel.projectId,
          now: undefined,
          clockSkewSeconds: config.zitadel.clockSkewSeconds,
          projectProvisionerSubjectId: config.zitadel.projectProvisionerSubjectId,
          projectProvisionerSubjectIds: config.zitadel.projectProvisionerSubjectIds,
        }
      : undefined

  const app = apiAppCreate({
    projectRepository,
    projectArchiveWorkflow,
    projectUnarchiveWorkflow,
    storageMigrationRepository,
    storageMigrationWorkflowEnqueue: (input) => storageMigrationWorkflowEnqueue(connection.data.db, input),
    assetApiRepository,
    storage,
    uploadApiRepository,
    deletionApiRepository,
    workflowApiRepository,
    backupApiRepository,
    catalogApiRepository,
    catalogPublicationService,
    auditApiRepository,
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
