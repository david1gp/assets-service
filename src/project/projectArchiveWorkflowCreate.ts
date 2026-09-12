import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackupReceipt } from "../backup/backupReceiptSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { contentSha256Create } from "../schemas/contentSha256Create.js"
import { rcloneBackupRemotePathValidate } from "../backup/rcloneBackupRemotePathValidate.js"
import { storageBindingResolve } from "../storage/storageBindingResolve.js"
import { storageBucketDedicatedValidate } from "../storage/storageBucketDedicatedValidate.js"
import { storageProjectObjectsDelete } from "../storage/storageProjectObjectsDelete.js"
import { wranglerBucketDelete } from "../wrangler/wranglerBucketDelete.js"
import type { StorageBinding } from "../storage/storageBindingSchema.js"
import type { ProjectArchiveWorkflow } from "./projectArchiveWorkflow.js"
import type { ProjectArchiveWorkflowCreateInput } from "./projectArchiveWorkflowCreateInput.js"

type ArchiveResources = {
  bindings: readonly StorageBinding[]
  buckets: readonly string[]
}

export const projectArchiveWorkflowCreate = (input: ProjectArchiveWorkflowCreateInput): ProjectArchiveWorkflow => {
  const projectArchive: ProjectArchiveWorkflow["projectArchive"] = async (projectIdentifier) => {
    const op = "projectArchiveWorkflow"
    try {
      const project = input.projectRepository.projectRead(projectIdentifier)
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
      if (input.projectRepository.projectArchiveStateWrite === undefined)
        return resultErrorCreate(op, "Project archive lifecycle persistence is not configured")

      const backups = await currentSourcesBackupsVerify(input, project.data.id)
      if (!backups.success) return backups
      const resources = archiveResourcesRead(input, project.data.id)
      if (!resources.success) return resources
      const dedication = archiveBucketsDedicatedValidate(project.data.id, resources.data, input)
      if (!dedication.success) return dedication

      if (currentState === "active") {
        const transitioned = input.projectRepository.projectArchiveStateWrite(
          project.data.id,
          "archiving",
          currentState,
        )
        if (!transitioned.success) return transitioned
        if (transitioned.data === null) return resultErrorCreate(op, "The project disappeared while archiving")
      }

      let deletedObjectCount = 0
      const deleted = await projectObjectsDelete(input, resources.data.bindings, true)
      if (!deleted.success) return deleted
      deletedObjectCount = deleted.data

      const deletedBuckets: string[] = []
      for (const bucket of resources.data.buckets) {
        const deleted = await wranglerBucketDelete(input.wranglerRunner, {
          bucket,
          projectId: project.data.id,
          bindings: dedication.data,
          ...(input.wranglerProfile === undefined ? {} : { profile: input.wranglerProfile }),
        })
        if (!deleted.success) return deleted
        if (deleted.data.deleted) deletedBuckets.push(bucket)
      }

      const archived = input.projectRepository.projectArchiveStateWrite(project.data.id, "archived", "archiving")
      if (!archived.success) return archived
      if (archived.data === null) return resultErrorCreate(op, "The project disappeared before archive completion")
      return {
        success: true,
        data: { project: archived.data, deletedBuckets, deletedObjectCount },
      }
    } catch (error) {
      return resultErrorCreate(op, "The project archive workflow failed", error)
    }
  }

  return { projectArchive }
}

async function currentSourcesBackupsVerify(
  input: ProjectArchiveWorkflowCreateInput,
  projectId: string,
): Promise<Result<true>> {
  const assets = input.assetApiRepository.assetsRead(projectId)
  if (!assets.success) return assets
  let workspace: string | undefined
  try {
    workspace = await mkdtemp(join(input.temporaryDirectory ?? tmpdir(), "assets-archive-"))
    for (const asset of assets.data) {
      const detail = input.assetApiRepository.assetRead(projectId, asset.id)
      if (!detail.success) return detail
      if (detail.data === null) return resultErrorCreate("projectArchiveWorkflow", `Asset ${asset.id} was not found`)
      const sourceRevisionId = detail.data.currentSourceRevisionId
      const source = detail.data.sourceHistory.find((candidate) => candidate.id === sourceRevisionId)
      if (source === undefined)
        return resultErrorCreate("projectArchiveWorkflow", `Current source revision is missing for asset ${asset.id}`)

      const receipt = await verifiedReceiptRead(input, projectId, source.id, source.byteSize, source.sha256)
      if (!receipt.success) return receipt
      const destinationPath = join(workspace, `${source.id}.original`)
      try {
        const restored = await input.restore({
          remotePath: receipt.data.remotePath,
          destinationPath,
          expectedByteSize: source.byteSize,
          expectedSha256: source.sha256,
        })
        if (!restored.success) return restored
        if (
          restored.data.destinationPath !== destinationPath ||
          restored.data.checkResult !== "verified" ||
          restored.data.byteSize !== source.byteSize ||
          restored.data.sha256 !== source.sha256
        )
          return resultErrorCreate("projectArchiveWorkflow", "The restored original did not match its verified receipt")

        let bytes: Uint8Array
        try {
          bytes = new Uint8Array(await readFile(destinationPath))
        } catch (error) {
          return resultErrorCreate("projectArchiveWorkflow", "The restored original could not be read", error)
        }
        if (bytes.byteLength !== source.byteSize || contentSha256Create(bytes) !== source.sha256)
          return resultErrorCreate("projectArchiveWorkflow", "The restored original checksum did not match its receipt")
      } finally {
        await rm(destinationPath, { force: true }).catch(() => undefined)
      }
    }
    return { success: true, data: true }
  } catch (error) {
    return resultErrorCreate("projectArchiveWorkflow", "The current source backups could not be verified", error)
  } finally {
    if (workspace !== undefined) await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function verifiedReceiptRead(
  input: ProjectArchiveWorkflowCreateInput,
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
    `A verified Google Drive backup is required for current source revision ${sourceRevisionId}`,
  )
}

function archiveResourcesRead(input: ProjectArchiveWorkflowCreateInput, projectId: string): Result<ArchiveResources> {
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
  const buckets = [...new Set(bindings.map((binding) => binding.bucket))]
  return { success: true, data: { bindings, buckets } }
}

function archiveBucketsDedicatedValidate(
  projectId: string,
  resources: ArchiveResources,
  input: ProjectArchiveWorkflowCreateInput,
): Result<readonly StorageBinding[]> {
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
    const dedicated = storageBucketDedicatedValidate({
      projectId,
      bucket,
      bindings: normalizedBindings,
    })
    if (!dedicated.success) return dedicated
  }
  return { success: true, data: normalizedBindings }
}

async function projectObjectsDelete(
  input: ProjectArchiveWorkflowCreateInput,
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
      if (allowMissingBucket && storageBucketMissingRead(deleted)) continue
      return deleted
    }
    deletedObjectCount += deleted.data.deletedCount
  }
  return { success: true, data: deletedObjectCount }
}

function storageBucketMissingRead(result: Extract<Result<unknown>, { success: false }>): boolean {
  if (result.rawData && typeof result.rawData === "object" && "status" in result.rawData)
    return result.rawData.status === 404
  return /\bstatus\s+404\b/u.test(result.errorMessage)
}
