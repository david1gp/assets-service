import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as v from "valibot"

import type { AssetDetail } from "../asset/assetApiRepository.js"
import type { BackupReceipt } from "../backup/backupReceiptSchema.js"
import { rcloneBackupRemotePathValidate } from "../backup/rcloneBackupRemotePathValidate.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import { cloudflareR2BucketCredentialCreate } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import {
  type CloudflareRequestCredentials,
  cloudflareRequestCredentialsSchema,
} from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import type { R2BucketCredentialCreateInput } from "../r2/r2BucketCredentialCreateInputSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import type { Workflow } from "../workflow/workflowSchema.js"
import { wranglerBucketCreate } from "../wrangler/wranglerBucketCreate.js"
import { wranglerProvisioningRun } from "../wrangler/wranglerProvisioningRun.js"
import type { Environment } from "./environmentSchema.js"
import type { ProjectUnarchiveWorkflow } from "./projectUnarchiveWorkflow.js"
import type { ProjectUnarchiveWorkflowCreateInput } from "./projectUnarchiveWorkflowCreateInput.js"

type UnarchiveResources = {
  binding: StorageBinding
  buckets: readonly string[]
  defaultEnvironment: Environment
}

type RestoreAsset = {
  detail: AssetDetail
  source: AssetDetail["sourceHistory"][number]
  receipt: BackupReceipt
}

type WorkflowDetail = {
  workflow: Workflow
  jobs: readonly unknown[]
}

type UnarchivePhase = NonNullable<
  Parameters<NonNullable<ProjectUnarchiveWorkflowCreateInput["unarchiveLogger"]>>[0]
>["phase"]

type ProjectUnarchiveWorkflowRunInput = ProjectUnarchiveWorkflowCreateInput & {
  cloudflareCredentials: CloudflareRequestCredentials
}

export const projectUnarchiveWorkflowCreate = (
  input: ProjectUnarchiveWorkflowCreateInput,
): ProjectUnarchiveWorkflow => {
  const createdCredentials = new Map<string, R2BucketCredentialCreateInput>()
  const projectUnarchive: ProjectUnarchiveWorkflow["projectUnarchive"] = async (
    projectIdentifier,
    cloudflareCredentials,
  ) => {
    const op = "projectUnarchiveWorkflow"
    const credentials = v.safeParse(cloudflareRequestCredentialsSchema, cloudflareCredentials)
    if (!credentials.success) return resultErrorCreate(op, "Cloudflare request credentials are invalid")
    const runInput: ProjectUnarchiveWorkflowRunInput = { ...input, cloudflareCredentials: credentials.output }
    let phase: UnarchivePhase = "preflight"
    try {
      const projectResult = runInput.projectRepository.projectRead(projectIdentifier)
      if (!projectResult.success) return projectResult
      if (projectResult.data === null) return resultErrorCreate(op, "The project was not found")

      const currentState = projectResult.data.archiveState ?? "active"
      if (currentState === "active")
        return {
          success: true,
          data: {
            project: projectResult.data,
            createdBuckets: [],
            restoredOriginalCount: 0,
            regeneratedOutputCount: 0,
          },
        }
      if (currentState === "archiving")
        return resultErrorCreate(op, "The project cannot be unarchived while it is archiving")
      if (runInput.projectRepository.projectArchiveStateWrite === undefined)
        return resultErrorCreate(op, "Project archive lifecycle persistence is not configured")

      unarchivePhaseLog(runInput, projectResult.data.id, "preflight")
      const resources = unarchiveResourcesRead(runInput, projectResult.data.id, projectResult.data.defaultEnvironment)
      if (!resources.success) return unarchiveErrorLog(runInput, projectResult.data.id, "preflight", resources)
      const domains = unarchiveDomainsRead(runInput, projectResult.data.id, resources.data.buckets)
      if (!domains.success) return unarchiveErrorLog(runInput, projectResult.data.id, "preflight", domains)

      const restoreAssets = await restoreAssetsRead(runInput, projectResult.data.id)
      if (!restoreAssets.success) return unarchiveErrorLog(runInput, projectResult.data.id, "preflight", restoreAssets)

      if (currentState === "archived") {
        const transitioned = runInput.projectRepository.projectArchiveStateWrite(
          projectResult.data.id,
          "unarchiving",
          currentState,
        )
        if (!transitioned.success) return unarchiveErrorLog(runInput, projectResult.data.id, "preflight", transitioned)
        if (transitioned.data === null)
          return unarchiveErrorLog(
            runInput,
            projectResult.data.id,
            "preflight",
            resultErrorCreate(op, "The project disappeared while unarchiving"),
          )
        if ((transitioned.data.archiveState ?? "active") !== "unarchiving")
          return unarchiveErrorLog(
            runInput,
            projectResult.data.id,
            "preflight",
            resultErrorCreate(op, "The project did not enter unarchiving state"),
          )
      }

      phase = "bucket-recreation"
      unarchivePhaseLog(runInput, projectResult.data.id, phase)
      const createdBuckets: string[] = []
      for (const bucket of resources.data.buckets) {
        const created = await wranglerBucketCreate(runInput.wranglerRunner, {
          bucket,
          ...(runInput.wranglerProfile === undefined ? {} : { profile: runInput.wranglerProfile }),
          ...runInput.cloudflareCredentials,
        })
        if (!created.success) return unarchiveErrorLog(runInput, projectResult.data.id, phase, created, { bucket })
        if (created.data.created) createdBuckets.push(bucket)
      }

      phase = "credential-recreation"
      unarchivePhaseLog(runInput, projectResult.data.id, phase)
      for (const bucket of resources.data.buckets) {
        const credential = await bucketCredentialRestore(runInput, projectResult.data.id, bucket, createdCredentials)
        if (!credential.success)
          return unarchiveErrorLog(runInput, projectResult.data.id, phase, credential, { bucket })
      }

      phase = "domain-restoration"
      unarchivePhaseLog(runInput, projectResult.data.id, phase)
      for (const domain of domains.data) {
        const restored = await customDomainRestore(runInput, domain.bucket, domain.customDomain, domain.zoneId)
        if (!restored.success)
          return unarchiveErrorLog(runInput, projectResult.data.id, phase, restored, {
            bucket: domain.bucket,
            customDomain: domain.customDomain,
          })
      }

      phase = "source-restoration"
      unarchivePhaseLog(runInput, projectResult.data.id, phase)
      const workspace = await mkdtemp(join(runInput.temporaryDirectory ?? tmpdir(), "assets-unarchive-"))
      try {
        let restoredOriginalCount = 0
        for (const asset of restoreAssets.data) {
          const restored = await restoreAsset(runInput, asset, resources.data.binding, workspace)
          if (!restored.success)
            return unarchiveErrorLog(runInput, projectResult.data.id, phase, restored, {
              assetId: asset.detail.id,
              sourceRevisionId: asset.source.id,
            })
          restoredOriginalCount += 1
        }

        phase = "output-regeneration"
        unarchivePhaseLog(runInput, projectResult.data.id, phase)
        let regeneratedOutputCount = 0
        const assetsById = new Map(restoreAssets.data.map((asset) => [asset.detail.id, asset]))
        for (const asset of assetsById.values()) {
          const regenerated = await regenerateAssetOutputs(
            runInput,
            projectResult.data.id,
            asset,
            resources.data.defaultEnvironment,
          )
          if (!regenerated.success)
            return unarchiveErrorLog(runInput, projectResult.data.id, phase, regenerated, { assetId: asset.detail.id })
          regeneratedOutputCount += regenerated.data
        }

        const activated = runInput.projectRepository.projectArchiveStateWrite(
          projectResult.data.id,
          "active",
          "unarchiving",
        )
        if (!activated.success) return unarchiveErrorLog(runInput, projectResult.data.id, "complete", activated)
        if (activated.data === null)
          return unarchiveErrorLog(
            runInput,
            projectResult.data.id,
            "complete",
            resultErrorCreate(op, "The project disappeared before unarchive completion"),
          )
        if ((activated.data.archiveState ?? "active") !== "active")
          return unarchiveErrorLog(
            runInput,
            projectResult.data.id,
            "complete",
            resultErrorCreate(op, "The project did not become active after unarchive completion"),
          )
        unarchivePhaseLog(runInput, projectResult.data.id, "complete")
        createdCredentials.clear()
        return {
          success: true,
          data: { project: activated.data, createdBuckets, restoredOriginalCount, regeneratedOutputCount },
        }
      } finally {
        await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
      }
    } catch (error) {
      unarchiveThrownErrorLog(runInput, projectIdentifier, phase, error)
      return resultErrorCreate(op, "The project unarchive workflow failed", error)
    }
  }

  return { projectUnarchive }
}

function unarchiveResourcesRead(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  defaultEnvironmentName: Environment["name"],
): Result<UnarchiveResources> {
  const environments = input.projectRepository.environmentsRead(projectId)
  if (!environments.success) return environments
  if (environments.data.length === 0)
    return resultErrorCreate("projectUnarchiveWorkflow", "The project has no environments")
  const defaultEnvironment = environments.data.find((environment) => environment.name === defaultEnvironmentName)
  if (defaultEnvironment === undefined)
    return resultErrorCreate("projectUnarchiveWorkflow", "The project default environment was not found")

  const binding = storageBindingResolve(defaultEnvironment, projectId)
  if (!binding.success) return binding
  return {
    success: true,
    data: {
      binding: binding.data,
      buckets: [binding.data.bucket],
      defaultEnvironment,
    },
  }
}

function unarchiveDomainsRead(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  buckets: readonly string[],
): Result<readonly { bucket: string; customDomain: string; zoneId: string }[]> {
  if (input.projectStorageDomainRepository === undefined) return { success: true, data: [] }
  const restored: { bucket: string; customDomain: string; zoneId: string }[] = []
  for (const bucket of buckets) {
    const domains = input.projectStorageDomainRepository.projectStorageDomainsForBucketRead(bucket)
    if (!domains.success) return domains
    for (const domain of domains.data) {
      if (domain.projectId === projectId) restored.push(domain)
    }
  }
  return { success: true, data: restored }
}

async function bucketCredentialRestore(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  bucket: string,
  createdCredentials: Map<string, R2BucketCredentialCreateInput>,
): Promise<Result<null>> {
  const repository = input.r2BucketCredentialRepository
  if (repository === undefined)
    return resultErrorCreate("projectUnarchiveWorkflow", "R2 bucket credential persistence is not configured")
  const existing = repository.r2BucketCredentialRead(bucket)
  if (!existing.success) return existing
  if (existing.data !== null) return { success: true, data: null }
  const key = `${projectId}\u0000${bucket}`
  let credential = createdCredentials.get(key)
  if (credential === undefined) {
    const create = input.r2BucketCredentialCreate ?? cloudflareR2BucketCredentialCreate
    const created = await create({
      ...input.cloudflareCredentials,
      bucket,
      name: `assets-service-unarchive-${projectId}-${bucket}`,
    })
    if (!created.success) return created
    credential = created.data
    createdCredentials.set(key, credential)
  }
  if (credential.bucket !== bucket)
    return resultErrorCreate("projectUnarchiveWorkflow", "The created R2 bucket credential targeted another bucket")
  const persisted = repository.r2BucketCredentialCreate(credential)
  if (!persisted.success) return persisted
  if (
    persisted.data.bucket !== credential.bucket ||
    persisted.data.accessKeyId !== credential.accessKeyId ||
    persisted.data.secretAccessKey !== credential.secretAccessKey ||
    persisted.data.revocationId !== credential.revocationId
  )
    return resultErrorCreate("projectUnarchiveWorkflow", "The persisted R2 bucket credential could not be verified")
  return { success: true, data: null }
}

async function customDomainRestore(
  input: ProjectUnarchiveWorkflowRunInput,
  bucket: string,
  customDomain: string,
  zoneId: string,
): Promise<Result<null>> {
  const restored = await wranglerProvisioningRun(input.wranglerRunner, {
    bucket,
    createBucket: false,
    customDomain,
    zoneId,
    ...(input.wranglerProfile === undefined ? {} : { profile: input.wranglerProfile }),
    ...input.cloudflareCredentials,
  })
  if (!restored.success) return restored
  const domain = restored.data.customDomain
  if (domain === undefined || domain.name !== customDomain || domain.attached !== true || domain.verified !== true)
    return resultErrorCreate("projectUnarchiveWorkflow", `The custom domain ${customDomain} could not be verified`)
  return { success: true, data: null }
}

async function restoreAssetsRead(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
): Promise<Result<readonly RestoreAsset[]>> {
  const assets = input.assetApiRepository.assetsRead(projectId)
  if (!assets.success) return assets
  const restoreAssets: RestoreAsset[] = []
  for (const asset of assets.data) {
    const detail = input.assetApiRepository.assetRead(projectId, asset.id)
    if (!detail.success) return detail
    if (detail.data === null) return resultErrorCreate("projectUnarchiveWorkflow", `Asset ${asset.id} was not found`)
    const assetDetail = detail.data
    if (!assetDetail.sourceHistory.some((source) => source.id === assetDetail.currentSourceRevisionId))
      return resultErrorCreate("projectUnarchiveWorkflow", `Current source revision is missing for asset ${asset.id}`)
    for (const source of assetDetail.sourceHistory) {
      const receipt = await verifiedReceiptRead(input, projectId, asset.id, source.id, source.byteSize, source.sha256)
      if (!receipt.success) return receipt
      restoreAssets.push({ detail: assetDetail, source, receipt: receipt.data })
    }
  }
  return { success: true, data: restoreAssets }
}

async function verifiedReceiptRead(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  assetId: string,
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
        receipt.remotePath.startsWith(`gdrive_beta:backups/${projectId}/`) &&
        rcloneBackupRemotePathValidate(receipt.remotePath),
    )
    if (matching !== undefined) return { success: true, data: matching }
    cursor = receipts.data.nextCursor ?? undefined
  } while (cursor !== undefined)
  return resultErrorCreate(
    "projectUnarchiveWorkflow",
    `A verified Google Drive backup is required for source revision ${sourceRevisionId} of asset ${assetId}`,
  )
}

async function restoreAsset(
  input: ProjectUnarchiveWorkflowRunInput,
  asset: RestoreAsset,
  binding: StorageBinding,
  workspace: string,
): Promise<Result<null>> {
  const location = storageObjectLocationCreate(binding, "private-source", asset.source.objectKey)
  if (!location.success) return location

  const existing = await input.storage.headObject(location.data)
  if (!existing.success) return existing
  if (existing.data !== null) {
    const verified = await storageObjectVerify(input.storage, {
      location: location.data,
      byteSize: asset.source.byteSize,
      sha256: asset.source.sha256,
      mediaType: asset.source.mediaType,
    })
    if (!verified.success) return verified
    return { success: true, data: null }
  }

  const destinationPath = join(workspace, `${asset.source.id}.original`)
  const restored = await input.restore({
    remotePath: asset.receipt.remotePath,
    destinationPath,
    expectedByteSize: asset.receipt.byteSize,
    expectedSha256: asset.receipt.sha256,
  })
  if (!restored.success) return restored
  if (
    restored.data.destinationPath !== destinationPath ||
    restored.data.checkResult !== "verified" ||
    restored.data.byteSize !== asset.source.byteSize ||
    restored.data.sha256 !== asset.source.sha256
  )
    return resultErrorCreate("projectUnarchiveWorkflow", "The restored original did not match its verified receipt")

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(destinationPath))
  } catch (error) {
    return resultErrorCreate("projectUnarchiveWorkflow", "The restored original could not be read", error)
  }
  if (bytes.byteLength !== asset.source.byteSize || contentSha256Create(bytes) !== asset.source.sha256)
    return resultErrorCreate("projectUnarchiveWorkflow", "The restored original checksum did not match its receipt")

  const stored = await storagePutImmutable(input.storage, {
    location: location.data,
    bytes,
    mediaType: asset.source.mediaType,
    sha256: asset.source.sha256,
  })
  if (!stored.success) {
    const raced = await storageObjectVerify(input.storage, {
      location: location.data,
      byteSize: asset.source.byteSize,
      sha256: asset.source.sha256,
      mediaType: asset.source.mediaType,
    })
    if (raced.success) return { success: true, data: null }
    return stored
  }
  const verified = await storageObjectVerify(input.storage, {
    location: location.data,
    byteSize: asset.source.byteSize,
    sha256: asset.source.sha256,
    mediaType: asset.source.mediaType,
  })
  if (!verified.success) return verified
  return { success: true, data: null }
}

async function regenerateAssetOutputs(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  asset: RestoreAsset,
  environment: Environment,
): Promise<Result<number>> {
  const reprocessed = input.assetApiRepository.assetReprocess(projectId, asset.detail.id, {
    environmentId: environment.id,
    workflowId: `workflow-unarchive-${canonicalJsonDigest({
      projectId,
      assetId: asset.detail.id,
      sourceRevisionId: asset.detail.currentSourceRevisionId,
    })}`,
  })
  if (!reprocessed.success) return reprocessed
  if (reprocessed.data === null || reprocessed.data.workflowId === undefined)
    return resultErrorCreate(
      "projectUnarchiveWorkflow",
      `Asset processing was not enqueued for asset ${asset.detail.id}`,
    )

  const completed = await workflowCompletionWait(input, projectId, reprocessed.data.workflowId)
  if (!completed.success) return completed
  const refreshed = input.assetApiRepository.assetRead(projectId, asset.detail.id)
  if (!refreshed.success) return refreshed
  if (refreshed.data === null)
    return resultErrorCreate("projectUnarchiveWorkflow", `Asset ${asset.detail.id} disappeared`)
  const definitions = refreshed.data.outputHistory
  if (definitions.length === 0)
    return resultErrorCreate("projectUnarchiveWorkflow", `Asset ${asset.detail.id} has no output definitions`)

  const binding = storageBindingResolve(environment, projectId)
  if (!binding.success) return binding
  let outputCount = 0
  for (const history of definitions) {
    const currentVersions = history.versions.filter(
      (version) => version.current && version.sourceRevisionId === refreshed.data?.currentSourceRevisionId,
    )
    if (currentVersions.length !== 1)
      return resultErrorCreate("projectUnarchiveWorkflow", `Output ${history.definition.key} was not regenerated`)
    const version = currentVersions[0]
    if (version === undefined)
      return resultErrorCreate("projectUnarchiveWorkflow", `Output ${history.definition.key} was not regenerated`)
    if (version.createdAt < completed.data.workflow.createdAt)
      return resultErrorCreate("projectUnarchiveWorkflow", `Output ${history.definition.key} was not regenerated`)
    const outputBlob = input.assetApiRepository.assetOutputBlobRead(projectId, asset.detail.id, version.id)
    if (!outputBlob.success) return outputBlob
    if (
      outputBlob.data === null ||
      outputBlob.data.environment !== environment.name ||
      outputBlob.data.objectKey !== version.objectKey ||
      outputBlob.data.byteSize !== version.byteSize ||
      outputBlob.data.mediaType !== version.mediaType
    )
      return resultErrorCreate(
        "projectUnarchiveWorkflow",
        `Published output ${history.definition.key} was not verified`,
      )

    const privateLocation = storageObjectLocationCreate(
      binding.data,
      "private-source",
      `outputs/${version.id}.${version.extension}`,
    )
    const publicLocation = storageObjectLocationCreate(binding.data, "public-output", version.objectKey)
    if (!privateLocation.success) return privateLocation
    if (!publicLocation.success) return publicLocation
    const privateVerified = await storageObjectVerify(input.storage, {
      location: privateLocation.data,
      byteSize: version.byteSize,
      sha256: version.sha256,
      mediaType: version.mediaType,
    })
    if (!privateVerified.success) return privateVerified
    const publicVerified = await storageObjectVerify(input.storage, {
      location: publicLocation.data,
      byteSize: version.byteSize,
      sha256: version.sha256,
      mediaType: version.mediaType,
    })
    if (!publicVerified.success) return publicVerified
    outputCount += 1
  }
  return { success: true, data: outputCount }
}

async function workflowCompletionWait(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  workflowId: string,
): Promise<Result<WorkflowDetail>> {
  const timeoutMs = input.workflowCompletionTimeoutMs ?? 300_000
  const pollMs = input.workflowPollMs ?? 250
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    return resultErrorCreate("projectUnarchiveWorkflow", "Workflow completion timeout is invalid")
  if (!Number.isInteger(pollMs) || pollMs < 0)
    return resultErrorCreate("projectUnarchiveWorkflow", "Workflow polling interval is invalid")

  const startedAt = Date.now()
  let retried = false
  while (true) {
    const detail = input.workflowApiRepository.workflowRead(projectId, workflowId)
    if (!detail.success) return detail
    if (detail.data === null)
      return resultErrorCreate("projectUnarchiveWorkflow", `Workflow ${workflowId} was not found`)
    if (detail.data.workflow.status === "succeeded") return { success: true, data: detail.data }
    if (detail.data.workflow.status === "failed") {
      if (retried)
        return resultErrorCreate("projectUnarchiveWorkflow", `Asset processing workflow ${workflowId} failed`)
      const retry = input.workflowApiRepository.workflowRetry(projectId, workflowId)
      if (!retry.success) return retry
      if (retry.data === null)
        return resultErrorCreate("projectUnarchiveWorkflow", `Workflow ${workflowId} disappeared during retry`)
      retried = true
      continue
    }
    if (detail.data.workflow.status === "cancelled")
      return resultErrorCreate("projectUnarchiveWorkflow", `Asset processing workflow ${workflowId} was cancelled`)
    if (Date.now() - startedAt >= timeoutMs)
      return resultErrorCreate(
        "projectUnarchiveWorkflow",
        `Asset processing workflow ${workflowId} did not complete in time`,
      )
    await wait(pollMs)
  }
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function unarchivePhaseLog(input: ProjectUnarchiveWorkflowRunInput, projectId: string, phase: UnarchivePhase): void {
  unarchiveLogWrite(input, {
    event: "phase",
    operation: "projectUnarchiveWorkflow",
    phase,
    projectId,
  })
}

function unarchiveErrorLog<T>(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  phase: UnarchivePhase,
  result: Result<T>,
  details: { bucket?: string; customDomain?: string; sourceRevisionId?: string; assetId?: string } = {},
): Extract<Result<T>, { success: false }> {
  if (!result.success) {
    unarchiveLogWrite(input, {
      event: "error",
      operation: "projectUnarchiveWorkflow",
      phase,
      projectId,
      ...details,
      error: cloudflareSecretRedact(result.errorMessage, [input.cloudflareCredentials?.apiToken]),
    })
    return result
  }
  return resultErrorCreate(
    "projectUnarchiveWorkflow",
    "The unarchive operation returned an unexpected success result",
  ) as Extract<Result<T>, { success: false }>
}

function unarchiveThrownErrorLog(
  input: ProjectUnarchiveWorkflowRunInput,
  projectId: string,
  phase: UnarchivePhase,
  error: unknown,
): void {
  unarchiveLogWrite(input, {
    event: "error",
    operation: "projectUnarchiveWorkflow",
    phase,
    projectId,
    error: cloudflareSecretRedact(error instanceof Error ? error.message : String(error), [
      input.cloudflareCredentials?.apiToken,
    ]),
  })
}

function unarchiveLogWrite(
  input: ProjectUnarchiveWorkflowRunInput,
  entry: NonNullable<Parameters<NonNullable<ProjectUnarchiveWorkflowCreateInput["unarchiveLogger"]>>[0]>,
): void {
  const logger = input.unarchiveLogger ?? unarchiveConsoleLog
  try {
    logger({
      ...entry,
      ...(entry.error === undefined
        ? {}
        : { error: cloudflareSecretRedact(entry.error, [input.cloudflareCredentials?.apiToken]) }),
    })
  } catch {
    // Logging must not change the retryable unarchive result.
  }
}

function unarchiveConsoleLog(
  entry: NonNullable<Parameters<NonNullable<ProjectUnarchiveWorkflowCreateInput["unarchiveLogger"]>>[0]>,
): void {
  const serialized = JSON.stringify(entry)
  if (entry.event === "error") console.error(serialized)
  else console.info(serialized)
}
