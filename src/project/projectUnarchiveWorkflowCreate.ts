import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { AssetDetail } from "../asset/assetApiRepository.js"
import type { BackupReceipt } from "../backup/backupReceiptSchema.js"
import { rcloneBackupRemotePathValidate } from "../backup/rcloneBackupRemotePathValidate.js"
import { canonicalJsonDigest } from "../catalog/canonicalJsonDigest.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import { storageBucketDedicatedValidate } from "../storage/storageBucketDedicatedValidate.js"
import { storageObjectLocationCreate } from "../storage/storageObjectLocationCreate.js"
import { storageObjectVerify } from "../storage/storageObjectVerify.js"
import { storagePutImmutable } from "../storage/storagePutImmutable.js"
import type { Workflow } from "../workflow/workflowSchema.js"
import { wranglerBucketCreate } from "../wrangler/wranglerBucketCreate.js"
import type { Environment } from "./environmentSchema.js"
import type { ProjectUnarchiveWorkflow } from "./projectUnarchiveWorkflow.js"
import type { ProjectUnarchiveWorkflowCreateInput } from "./projectUnarchiveWorkflowCreateInput.js"

type UnarchiveResources = {
  environments: readonly Environment[]
  bindings: readonly StorageBinding[]
  buckets: readonly string[]
  defaultEnvironment: Environment
}

type RestoreAsset = {
  detail: AssetDetail
  source: AssetDetail["sourceHistory"][number]
  receipt: BackupReceipt
  sourceEnvironment: Environment
}

type WorkflowDetail = {
  workflow: Workflow
  jobs: readonly unknown[]
}

export const projectUnarchiveWorkflowCreate = (
  input: ProjectUnarchiveWorkflowCreateInput,
): ProjectUnarchiveWorkflow => {
  const projectUnarchive: ProjectUnarchiveWorkflow["projectUnarchive"] = async (projectIdentifier) => {
    const op = "projectUnarchiveWorkflow"
    try {
      const projectResult = input.projectRepository.projectRead(projectIdentifier)
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
      if (input.projectRepository.projectArchiveStateWrite === undefined)
        return resultErrorCreate(op, "Project archive lifecycle persistence is not configured")

      const resources = unarchiveResourcesRead(input, projectResult.data.id, projectResult.data.defaultEnvironment)
      if (!resources.success) return resources
      const dedicated = bucketsDedicatedValidate(projectResult.data.id, resources.data, input)
      if (!dedicated.success) return dedicated

      const restoreAssets = await restoreAssetsRead(
        input,
        projectResult.data.id,
        resources.data.environments,
        resources.data.defaultEnvironment,
      )
      if (!restoreAssets.success) return restoreAssets

      let operationProject = projectResult.data
      if (currentState === "archived") {
        const transitioned = input.projectRepository.projectArchiveStateWrite(
          projectResult.data.id,
          "unarchiving",
          currentState,
        )
        if (!transitioned.success) return transitioned
        if (transitioned.data === null) return resultErrorCreate(op, "The project disappeared while unarchiving")
        if ((transitioned.data.archiveState ?? "active") !== "unarchiving")
          return resultErrorCreate(op, "The project did not enter unarchiving state")
        operationProject = transitioned.data
      }

      const createdBuckets: string[] = []
      for (const bucket of resources.data.buckets) {
        const created = await wranglerBucketCreate(input.wranglerRunner, {
          bucket,
          ...(input.wranglerProfile === undefined ? {} : { profile: input.wranglerProfile }),
        })
        if (!created.success) return created
        if (created.data.created) createdBuckets.push(bucket)
      }

      const workspace = await mkdtemp(join(input.temporaryDirectory ?? tmpdir(), "assets-unarchive-"))
      try {
        let restoredOriginalCount = 0
        for (const asset of restoreAssets.data) {
          const restored = await restoreAsset(input, asset, workspace)
          if (!restored.success) return restored
          restoredOriginalCount += 1
        }

        let regeneratedOutputCount = 0
        for (const asset of restoreAssets.data) {
          const regenerated = await regenerateAssetOutputs(
            input,
            projectResult.data.id,
            asset,
            resources.data.defaultEnvironment,
            operationProject.updatedAt,
          )
          if (!regenerated.success) return regenerated
          regeneratedOutputCount += regenerated.data
        }

        const activated = input.projectRepository.projectArchiveStateWrite(
          projectResult.data.id,
          "active",
          "unarchiving",
        )
        if (!activated.success) return activated
        if (activated.data === null) return resultErrorCreate(op, "The project disappeared before unarchive completion")
        if ((activated.data.archiveState ?? "active") !== "active")
          return resultErrorCreate(op, "The project did not become active after unarchive completion")
        return {
          success: true,
          data: { project: activated.data, createdBuckets, restoredOriginalCount, regeneratedOutputCount },
        }
      } finally {
        await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
      }
    } catch (error) {
      return resultErrorCreate(op, "The project unarchive workflow failed", error)
    }
  }

  return { projectUnarchive }
}

function unarchiveResourcesRead(
  input: ProjectUnarchiveWorkflowCreateInput,
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

  const bindings: StorageBinding[] = []
  for (const environment of environments.data) {
    const binding = storageBindingResolve(environment, projectId)
    if (!binding.success) return binding
    bindings.push(binding.data)
  }
  return {
    success: true,
    data: {
      environments: environments.data,
      bindings,
      buckets: [...new Set(bindings.map((binding) => binding.bucket))],
      defaultEnvironment,
    },
  }
}

function bucketsDedicatedValidate(
  projectId: string,
  resources: UnarchiveResources,
  input: ProjectUnarchiveWorkflowCreateInput,
): Result<true> {
  const allBindings = input.storageBindingsRead()
  if (!allBindings.success) return allBindings
  const bindings = [...allBindings.data, ...resources.bindings]
  const uniqueBindings = new Map<string, StorageBinding>()
  for (const binding of bindings) {
    const key = `${binding.projectId}\u0000${binding.environment}\u0000${binding.bucket}\u0000${binding.prefix}`
    uniqueBindings.set(key, binding)
  }
  const normalizedBindings = [...uniqueBindings.values()]
  for (const bucket of resources.buckets) {
    const dedicated = storageBucketDedicatedValidate({ projectId, bucket, bindings: normalizedBindings })
    if (!dedicated.success) return dedicated
  }
  return { success: true, data: true }
}

async function restoreAssetsRead(
  input: ProjectUnarchiveWorkflowCreateInput,
  projectId: string,
  environments: readonly Environment[],
  defaultEnvironment: Environment,
): Promise<Result<readonly RestoreAsset[]>> {
  const assets = input.assetApiRepository.assetsRead(projectId)
  if (!assets.success) return assets
  const environmentByName = new Map(environments.map((environment) => [environment.name, environment]))
  const restoreAssets: RestoreAsset[] = []
  for (const asset of assets.data) {
    const detail = input.assetApiRepository.assetRead(projectId, asset.id)
    if (!detail.success) return detail
    if (detail.data === null) return resultErrorCreate("projectUnarchiveWorkflow", `Asset ${asset.id} was not found`)
    const assetDetail = detail.data
    const source = assetDetail.sourceHistory.find((candidate) => candidate.id === assetDetail.currentSourceRevisionId)
    if (source === undefined)
      return resultErrorCreate("projectUnarchiveWorkflow", `Current source revision is missing for asset ${asset.id}`)
    const receipt = await verifiedReceiptRead(input, projectId, asset.id, source.id, source.byteSize, source.sha256)
    if (!receipt.success) return receipt
    const sourceEnvironmentName = input.assetApiRepository.assetSourceEnvironmentRead(projectId, asset.id, source.id)
    if (!sourceEnvironmentName.success) return sourceEnvironmentName
    const sourceEnvironment =
      sourceEnvironmentName.data === null ? defaultEnvironment : environmentByName.get(sourceEnvironmentName.data)
    if (sourceEnvironment === undefined)
      return resultErrorCreate("projectUnarchiveWorkflow", `Source environment is missing for asset ${asset.id}`)
    restoreAssets.push({ detail: assetDetail, source, receipt: receipt.data, sourceEnvironment })
  }
  return { success: true, data: restoreAssets }
}

async function verifiedReceiptRead(
  input: ProjectUnarchiveWorkflowCreateInput,
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
        rcloneBackupRemotePathValidate(receipt.remotePath),
    )
    if (matching !== undefined) return { success: true, data: matching }
    cursor = receipts.data.nextCursor ?? undefined
  } while (cursor !== undefined)
  return resultErrorCreate(
    "projectUnarchiveWorkflow",
    `A verified Google Drive backup is required for current source revision ${sourceRevisionId} of asset ${assetId}`,
  )
}

async function restoreAsset(
  input: ProjectUnarchiveWorkflowCreateInput,
  asset: RestoreAsset,
  workspace: string,
): Promise<Result<null>> {
  const sourceBinding = storageBindingResolve(asset.sourceEnvironment, asset.detail.projectId)
  if (!sourceBinding.success) return sourceBinding
  const location = storageObjectLocationCreate(sourceBinding.data, "private-source", asset.source.objectKey)
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
  input: ProjectUnarchiveWorkflowCreateInput,
  projectId: string,
  asset: RestoreAsset,
  environment: Environment,
  operationUpdatedAt: string,
): Promise<Result<number>> {
  const reprocessed = input.assetApiRepository.assetReprocess(projectId, asset.detail.id, {
    environmentId: environment.id,
    workflowId: `workflow-unarchive-${canonicalJsonDigest({ projectId, assetId: asset.detail.id, operationUpdatedAt })}`,
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
  input: ProjectUnarchiveWorkflowCreateInput,
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
