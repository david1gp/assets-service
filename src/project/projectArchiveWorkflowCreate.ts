import * as v from "valibot"
import type { BackupReceipt } from "../backup/backupReceiptSchema.js"
import { rcloneBackupRemotePathValidate } from "../backup/rcloneBackupRemotePathValidate.js"
import { cloudflareR2BucketCredentialRevoke } from "../cloudflare/cloudflareR2BucketCredentialRevoke.js"
import {
  type CloudflareRequestCredentials,
  cloudflareRequestCredentialsSchema,
} from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageBucketDedicatedValidate } from "../storage/storageBucketDedicatedValidate.js"
import { storageProjectObjectsDelete } from "../storage/storageProjectObjectsDelete.js"
import { wranglerBucketDelete } from "../wrangler/wranglerBucketDelete.js"
import { wranglerBucketDomainDelete } from "../wrangler/wranglerBucketDomainDelete.js"
import type { ProjectArchiveWorkflow } from "./projectArchiveWorkflow.js"
import type { ProjectArchiveWorkflowCreateInput } from "./projectArchiveWorkflowCreateInput.js"
import type { ProjectStorageLocation } from "./projectStorageLocationSchema.js"

type ArchiveResources = {
  bindings: readonly StorageBinding[]
  buckets: readonly string[]
  allBindings: readonly StorageBinding[]
}

type ArchiveDedication = {
  bindings: readonly StorageBinding[]
  buckets: readonly string[]
}

type ArchivePhase = NonNullable<Parameters<NonNullable<ProjectArchiveWorkflowCreateInput["archiveLogger"]>>[0]>["phase"]

type ProjectArchiveWorkflowRunInput = ProjectArchiveWorkflowCreateInput & {
  cloudflareCredentials: CloudflareRequestCredentials
}

export const projectArchiveWorkflowCreate = (input: ProjectArchiveWorkflowCreateInput): ProjectArchiveWorkflow => {
  const projectArchive: ProjectArchiveWorkflow["projectArchive"] = async (projectIdentifier, cloudflareCredentials) => {
    const op = "projectArchiveWorkflow"
    const credentials = v.safeParse(cloudflareRequestCredentialsSchema, cloudflareCredentials)
    if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")
    const runInput: ProjectArchiveWorkflowRunInput = { ...input, cloudflareCredentials: credentials.output }
    try {
      const project = runInput.projectRepository.projectRead(projectIdentifier)
      if (!project.success) return project
      if (project.data === null) return resultErrorCreate(op, "The project was not found")

      const currentState = project.data.archiveState ?? "active"
      if (currentState === "archived")
        return {
          success: true,
          data: { project: project.data, deletedBuckets: [], deletedObjectCount: 0 },
        }
      if (currentState === "unarchiving")
        return resultErrorCreate(op, "The project cannot be archived while it is unarchiving")
      if (runInput.projectRepository.projectArchiveStateWrite === undefined)
        return resultErrorCreate(op, "Project archive lifecycle persistence is not configured")

      archivePhaseLog(runInput, project.data.id, "preflight")
      const backups = await sourceRevisionsBackupsVerify(runInput, project.data.id)
      if (!backups.success) return archiveErrorLog(runInput, project.data.id, "preflight", backups)
      const resources = archiveResourcesRead(runInput, project.data.id)
      if (!resources.success) return archiveErrorLog(runInput, project.data.id, "preflight", resources)
      const dedication = archiveBucketsDedicatedValidate(project.data.id, resources.data)
      if (!dedication.success) return archiveErrorLog(runInput, project.data.id, "preflight", dedication)

      if (currentState === "active") {
        const transitioned = runInput.projectRepository.projectArchiveStateWrite(
          project.data.id,
          "archiving",
          currentState,
        )
        if (!transitioned.success) return archiveErrorLog(runInput, project.data.id, "preflight", transitioned)
        if (transitioned.data === null)
          return archiveErrorLog(
            runInput,
            project.data.id,
            "preflight",
            resultErrorCreate(op, "The project disappeared while archiving"),
          )
      }

      archivePhaseLog(runInput, project.data.id, "storage-cleanup")
      let deletedObjectCount = 0
      const deleted = await projectObjectsDelete(runInput, resources.data.bindings, true)
      if (!deleted.success) return archiveErrorLog(runInput, project.data.id, "storage-cleanup", deleted)
      deletedObjectCount = deleted.data

      archivePhaseLog(runInput, project.data.id, "domain-cleanup")
      archivePhaseLog(runInput, project.data.id, "bucket-cleanup")
      const deletedBuckets: string[] = []
      for (const bucket of dedication.data.buckets) {
        const cleaned = await dedicatedBucketCleanup(runInput, {
          bucket,
          projectId: project.data.id,
          bindings: dedication.data.bindings,
        })
        if (!cleaned.success) return archiveErrorLog(runInput, project.data.id, "bucket-cleanup", cleaned)
        if (cleaned.data.deleted) deletedBuckets.push(bucket)
      }

      const archived = runInput.projectRepository.projectArchiveStateWrite(project.data.id, "archived", "archiving")
      if (!archived.success) return archiveErrorLog(runInput, project.data.id, "complete", archived)
      if (archived.data === null)
        return archiveErrorLog(
          runInput,
          project.data.id,
          "complete",
          resultErrorCreate(op, "The project disappeared before archive completion"),
        )
      archivePhaseLog(runInput, project.data.id, "complete")
      return {
        success: true,
        data: { project: archived.data, deletedBuckets, deletedObjectCount },
      }
    } catch (error) {
      archiveThrownErrorLog(runInput, projectIdentifier, "complete", error)
      return resultErrorCreate(op, "The project archive workflow failed", error)
    }
  }

  return { projectArchive }
}

async function sourceRevisionsBackupsVerify(
  input: ProjectArchiveWorkflowRunInput,
  projectId: string,
): Promise<Result<true>> {
  const assets = input.assetApiRepository.assetsRead(projectId)
  if (!assets.success) return assets
  for (const asset of assets.data) {
    const detail = input.assetApiRepository.assetRead(projectId, asset.id)
    if (!detail.success) return detail
    if (detail.data === null) return resultErrorCreate("projectArchiveWorkflow", `Asset ${asset.id} was not found`)
    for (const source of detail.data.sourceHistory) {
      const receipt = await verifiedReceiptRead(input, projectId, source.id, source.byteSize, source.sha256)
      if (!receipt.success) return receipt
    }
  }
  return { success: true, data: true }
}

async function verifiedReceiptRead(
  input: ProjectArchiveWorkflowRunInput,
  projectId: string,
  sourceRevisionId: string,
  byteSize: number,
  sha256: string,
): Promise<Result<BackupReceipt>> {
  let cursor: number | undefined
  do {
    const receipts = input.backupApiRepository.backupReceiptsRead(projectId, {
      ...(cursor === undefined ? {} : { cursor }),
      sourceRevisionId,
      checkResult: "verified",
      limit: 100,
    })
    if (!receipts.success) return receipts
    const matching = receipts.data.items.find(
      (receipt) =>
        receipt.projectId === projectId &&
        receipt.sourceRevisionId === sourceRevisionId &&
        receipt.byteSize === byteSize &&
        receipt.sha256 === sha256 &&
        receipt.checkResult === "verified" &&
        rcloneBackupRemotePathValidate(receipt.remotePath),
    )
    if (matching !== undefined) return { success: true, data: matching }
    cursor = receipts.data.nextCursor ?? undefined
  } while (cursor !== undefined)
  return resultErrorCreate(
    "projectArchiveWorkflow",
    `A verified Google Drive backup is required for source revision ${sourceRevisionId}`,
  )
}

function archiveResourcesRead(input: ProjectArchiveWorkflowRunInput, projectId: string): Result<ArchiveResources> {
  const allBindings = input.storageBindingsRead()
  if (!allBindings.success) return allBindings
  const environments = input.projectRepository.environmentsRead(projectId)
  if (!environments.success) return environments
  if (environments.data.length === 0)
    return resultErrorCreate("projectArchiveWorkflow", "The project has no environments")

  const bindings: StorageBinding[] = []
  for (const environment of environments.data) {
    const binding = storageBindingResolve(environment, projectId)
    if (!binding.success) return binding
    bindings.push(binding.data)
  }
  const locations = input.projectRepository.projectStorageLocationsRead?.(projectId)
  if (locations !== undefined) {
    if (!locations.success) return locations
    for (const location of locations.data) {
      if (location.projectId !== projectId)
        return resultErrorCreate("projectArchiveWorkflow", "A project storage location belonged to another project")
      bindings.push(projectStorageLocationBindingCreate(location, bindings))
    }
  }
  for (const binding of allBindings.data) if (binding.projectId === projectId) bindings.push(binding)
  const uniqueBindings = new Map<string, StorageBinding>()
  for (const binding of bindings) uniqueBindings.set(`${binding.bucket}\u0000${binding.prefix}`, binding)
  const normalizedBindings = [...uniqueBindings.values()]
  const buckets = [...new Set(normalizedBindings.map((binding) => binding.bucket))]
  return { success: true, data: { bindings: normalizedBindings, buckets, allBindings: allBindings.data } }
}

function archiveBucketsDedicatedValidate(projectId: string, resources: ArchiveResources): Result<ArchiveDedication> {
  const bindings = [...resources.allBindings, ...resources.bindings]
  const uniqueBindings = new Map<string, StorageBinding>()
  for (const binding of bindings) {
    const key = `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`
    uniqueBindings.set(key, binding)
  }
  const normalizedBindings = [...uniqueBindings.values()]
  const dedicatedBuckets: string[] = []
  for (const bucket of resources.buckets) {
    const bucketBindings = normalizedBindings.filter((binding) => binding.bucket === bucket)
    if (bucketBindings.some((binding) => binding.projectId !== projectId)) continue
    const dedicated = storageBucketDedicatedValidate({
      projectId,
      bucket,
      bindings: normalizedBindings,
    })
    if (!dedicated.success) return dedicated
    dedicatedBuckets.push(bucket)
  }
  return { success: true, data: { bindings: normalizedBindings, buckets: dedicatedBuckets } }
}

async function dedicatedBucketCleanup(
  input: ProjectArchiveWorkflowRunInput,
  request: { bucket: string; projectId: string; bindings: readonly StorageBinding[] },
): Promise<Result<{ deleted: boolean }>> {
  const credential = await archiveCredentialRead(input, request.bucket)
  if (!credential.success) return credential
  const domains = archiveDomainsRead(input, request.bucket, request.projectId)
  if (!domains.success) return domains
  for (const domain of domains.data) {
    archivePhaseLog(input, request.projectId, "domain-cleanup", { bucket: request.bucket })
    const deleted = await wranglerBucketDomainDelete(input.wranglerRunner, {
      bucket: request.bucket,
      customDomain: domain,
      ...(input.wranglerProfile === undefined ? {} : { profile: input.wranglerProfile }),
      ...input.cloudflareCredentials,
    })
    if (!deleted.success) return deleted
  }

  const deleted = await wranglerBucketDelete(input.wranglerRunner, {
    bucket: request.bucket,
    projectId: request.projectId,
    bindings: request.bindings,
    ...(input.wranglerProfile === undefined ? {} : { profile: input.wranglerProfile }),
    ...input.cloudflareCredentials,
  })
  if (!deleted.success) return deleted
  if (credential.data === null) return { success: true, data: { deleted: deleted.data.deleted } }

  archivePhaseLog(input, request.projectId, "credential-cleanup", { bucket: request.bucket })
  const revoke = input.r2BucketCredentialRevoke ?? cloudflareR2BucketCredentialRevoke
  const revoked = await revoke({
    accountId: input.cloudflareCredentials.accountId,
    apiToken: input.cloudflareCredentials.apiToken,
    revocationId: credential.data.revocationId,
  })
  if (!revoked.success) return revoked
  if (input.r2BucketCredentialRepository === undefined)
    return resultErrorCreate("projectArchiveWorkflow", "R2 bucket credential persistence is not configured")
  const removed = input.r2BucketCredentialRepository.r2BucketCredentialDelete(request.bucket)
  if (!removed.success) return removed
  return { success: true, data: { deleted: deleted.data.deleted } }
}

async function archiveCredentialRead(
  input: ProjectArchiveWorkflowRunInput,
  bucket: string,
): Promise<
  ReturnType<NonNullable<ProjectArchiveWorkflowCreateInput["r2BucketCredentialRepository"]>["r2BucketCredentialRead"]>
> {
  if (input.r2BucketCredentialRepository === undefined) return { success: true, data: null }
  return input.r2BucketCredentialRepository.r2BucketCredentialRead(bucket)
}

function archiveDomainsRead(
  input: ProjectArchiveWorkflowRunInput,
  bucket: string,
  projectId: string,
): Result<readonly string[]> {
  if (input.projectStorageDomainRepository === undefined) return { success: true, data: [] }
  const domains = input.projectStorageDomainRepository.projectStorageDomainsForBucketRead(bucket)
  if (!domains.success) return domains
  const projectDomains: string[] = []
  for (const domain of domains.data) {
    if (domain.projectId !== projectId)
      return resultErrorCreate(
        "projectArchiveWorkflow",
        `The dedicated bucket ${bucket} has a custom domain belonging to another project`,
      )
    projectDomains.push(domain.customDomain)
  }
  return { success: true, data: projectDomains }
}

async function projectObjectsDelete(
  input: ProjectArchiveWorkflowRunInput,
  bindings: readonly StorageBinding[],
  allowMissingBucket: boolean,
): Promise<Result<number>> {
  const uniqueBindings = new Map<string, StorageBinding>()
  for (const binding of bindings) {
    if (binding.prefix.length === 0) continue
    uniqueBindings.set(`${binding.bucket}\u0000${binding.prefix}`, binding)
  }
  let deletedObjectCount = 0
  for (const binding of uniqueBindings.values()) {
    const deleted = await storageProjectObjectsDelete(input.storage, {
      binding,
      ...(input.storageObjectListMaxKeys === undefined ? {} : { maxKeys: input.storageObjectListMaxKeys }),
    })
    if (!deleted.success) {
      if (allowMissingBucket && storageResourceMissingRead(deleted)) continue
      return deleted
    }
    deletedObjectCount += deleted.data.deletedCount
  }
  return { success: true, data: deletedObjectCount }
}

function storageResourceMissingRead(result: Extract<Result<unknown>, { success: false }>): boolean {
  for (const diagnostic of [result.rawData, result.diagnostics]) {
    if (diagnostic && typeof diagnostic === "object" && "status" in diagnostic && diagnostic.status === 404) return true
  }
  return /(?:\bstatus\s+404\b|\b404\b|not found|does not exist|no such key)/iu.test(result.errorMessage)
}

function projectStorageLocationBindingCreate(
  location: ProjectStorageLocation,
  currentBindings: readonly StorageBinding[],
): StorageBinding {
  const currentBinding = currentBindings.find(
    (binding) => binding.environment === location.environment && binding.projectId === location.projectId,
  )
  return {
    projectId: location.projectId,
    environment: location.environment,
    bucket: location.bucket,
    prefix: location.prefix,
    publicBaseUrl: currentBinding?.publicBaseUrl ?? "https://archive.invalid",
  }
}

function archivePhaseLog(
  input: ProjectArchiveWorkflowRunInput,
  projectId: string,
  phase: ArchivePhase,
  details: { bucket?: string; prefix?: string } = {},
): void {
  archiveLogWrite(input, {
    event: "phase",
    operation: "projectArchiveWorkflow",
    phase,
    projectId,
    ...details,
  })
}

function archiveErrorLog<T>(
  input: ProjectArchiveWorkflowRunInput,
  projectId: string,
  phase: ArchivePhase,
  result: Result<T>,
): Extract<Result<T>, { success: false }> {
  if (!result.success) {
    archiveLogWrite(input, {
      event: "error",
      operation: "projectArchiveWorkflow",
      phase,
      projectId,
      error: cloudflareSecretRedact(result.errorMessage, [input.cloudflareCredentials?.apiToken]),
    })
    return result
  }
  return resultErrorCreate(
    "projectArchiveWorkflow",
    "The archive operation returned an unexpected success result",
  ) as Extract<Result<T>, { success: false }>
}

function archiveThrownErrorLog(
  input: ProjectArchiveWorkflowRunInput,
  projectId: string,
  phase: ArchivePhase,
  error: unknown,
): void {
  archiveLogWrite(input, {
    event: "error",
    operation: "projectArchiveWorkflow",
    phase,
    projectId,
    error: cloudflareSecretRedact(error instanceof Error ? error.message : String(error), [
      input.cloudflareCredentials?.apiToken,
    ]),
  })
}

function archiveLogWrite(
  input: ProjectArchiveWorkflowRunInput,
  entry: NonNullable<Parameters<NonNullable<ProjectArchiveWorkflowCreateInput["archiveLogger"]>>[0]>,
): void {
  const logger = input.archiveLogger ?? archiveConsoleLog
  try {
    logger({
      ...entry,
      ...(entry.error === undefined
        ? {}
        : { error: cloudflareSecretRedact(entry.error, [input.cloudflareCredentials?.apiToken]) }),
    })
  } catch {
    // Logging must not change the retryable archive result.
  }
}

function archiveConsoleLog(
  entry: NonNullable<Parameters<NonNullable<ProjectArchiveWorkflowCreateInput["archiveLogger"]>>[0]>,
): void {
  const serialized = JSON.stringify(entry)
  if (entry.event === "error") console.error(serialized)
  else console.info(serialized)
}
