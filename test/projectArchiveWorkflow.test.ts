import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import type { AssetApiRepository, AssetDetail } from "../src/asset/assetApiRepository.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../src/backup/rcloneBackupRestoreAdapter.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { ProjectArchiveState } from "../src/project/projectArchiveStateSchema.js"
import type { Project } from "../src/project/projectSchema.js"
import { projectArchiveWorkflowCreate } from "../src/project/projectArchiveWorkflowCreate.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"

const timestamp = "2026-09-12T00:00:00.000Z"
const projectId = "project-archive"
const sourceRevisionId = "source-current"
const sourceBytes = new Uint8Array([1])
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex")
const environment = {
  id: "environment-production",
  projectId,
  name: "production" as const,
  r2Bucket: "dedicated-project-archive",
  r2Prefix: `projects/${projectId}`,
  publicBaseUrl: "https://assets.example.test",
  createdAt: timestamp,
  updatedAt: timestamp,
}
const project = {
  id: projectId,
  organizationId: "organization-1",
  name: "Archive project",
  slug: "archive-project",
  defaultEnvironment: "production" as const,
  archiveState: "active" as const,
  createdAt: timestamp,
  updatedAt: timestamp,
}

describe("project archive workflow", () => {
  test("verifies current sources, deletes project objects and its dedicated bucket, and archives the project", async () => {
    const setup = workflowSetup()
    const storageLocation = storageObjectLocationCreate(setup.binding, "private-source", "source.png")
    const outputLocation = storageObjectLocationCreate(setup.binding, "public-output", "image_v1.webp")
    expect(storageLocation.success).toBe(true)
    expect(outputLocation.success).toBe(true)
    if (!storageLocation.success || !outputLocation.success) return
    await setup.storage.putImmutable({
      location: storageLocation.data,
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    })
    await setup.storage.putImmutable({
      location: outputLocation.data,
      bytes: new Uint8Array([2]),
      mediaType: "image/webp",
    })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "archived" },
        deletedBuckets: [environment.r2Bucket],
        deletedObjectCount: 2,
      },
    })
    expect(setup.state).toBe("archived")
    expect(setup.restoreCalls).toHaveLength(1)
    expect(setup.maxRestoreConcurrency).toBe(1)
    expect(setup.runnerCalls).toEqual([
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
      ["r2", "bucket", "delete", environment.r2Bucket, "--force"],
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
    ])
    expect(await setup.storage.listObjects?.({ bucket: environment.r2Bucket })).toMatchObject({
      success: true,
      data: { objects: [] },
    })
  })

  test("refuses to archive when a current source has no verified backup", async () => {
    const setup = workflowSetup({ verifiedBackup: false })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({ success: false })
    if (!archived.success) expect(archived.errorMessage).toContain("verified Google Drive backup")
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(0)
    expect(setup.runnerCalls).toEqual([])
  })

  test("refuses to archive when a verified receipt does not match the current source", async () => {
    const setup = workflowSetup({ receiptMismatch: true })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(0)
    expect(setup.runnerCalls).toEqual([])
  })

  test("refuses to archive when the current Google Drive object is missing", async () => {
    const setup = workflowSetup({ restoreFailure: "missing" })
    const sourceLocation = storageObjectLocationCreate(setup.binding, "private-source", "source.png")
    expect(sourceLocation.success).toBe(true)
    if (!sourceLocation.success) return
    await setup.storage.putImmutable({ location: sourceLocation.data, bytes: sourceBytes, mediaType: "image/png" })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({ success: false })
    expect(setup.state).toBe("active")
    expect(setup.runnerCalls).toEqual([])
    expect(setup.restoreCalls).toHaveLength(1)
    expect(await setup.storage.listObjects?.({ bucket: environment.r2Bucket })).toMatchObject({
      success: true,
      data: { objects: [{ key: `${environment.r2Prefix}/private/source/source.png` }] },
    })
  })

  test("refuses to archive when the downloaded Google Drive bytes are corrupt", async () => {
    const setup = workflowSetup({ restoreFailure: "corrupt" })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({
      success: false,
      errorMessage: "The restored original checksum did not match its receipt",
    })
    expect(setup.state).toBe("active")
    expect(setup.runnerCalls).toEqual([])
  })

  test("verifies current sources sequentially and removes each temporary restore", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "assets-archive-workflow-test-"))
    try {
      const setup = workflowSetup({ assetCount: 2, temporaryDirectory: temporaryRoot })

      const archived = await setup.workflow.projectArchive(projectId)

      expect(archived).toMatchObject({ success: true })
      expect(setup.restoreCalls).toHaveLength(2)
      expect(setup.maxRestoreConcurrency).toBe(1)
      expect(setup.restoreDirectoryEntries).toEqual([[], []])
      expect(await readdir(temporaryRoot)).toEqual([])
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  test("refuses to delete a bucket shared with another project", async () => {
    const setup = workflowSetup({
      rootPrefix: true,
      globalBindings: [
        setupBinding(projectId, environment.r2Bucket),
        setupBinding("other-project", environment.r2Bucket),
      ],
    })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({ success: false, errorMessage: "The bucket is shared with another project" })
    expect(setup.state).toBe("active")
    expect(setup.runnerCalls).toEqual([])
  })

  test("archives a dedicated root bucket through whole-bucket deletion", async () => {
    const setup = workflowSetup({ rootPrefix: true })
    const sourceLocation = storageObjectLocationCreate(setup.binding, "private-source", "source.png")
    const outputLocation = storageObjectLocationCreate(setup.binding, "public-output", "image_v1.webp")
    expect(sourceLocation.success).toBe(true)
    expect(outputLocation.success).toBe(true)
    if (!sourceLocation.success || !outputLocation.success) return
    await setup.storage.putImmutable({
      location: sourceLocation.data,
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    })
    await setup.storage.putImmutable({
      location: outputLocation.data,
      bytes: new Uint8Array([2]),
      mediaType: "image/webp",
    })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "archived" },
        deletedBuckets: [environment.r2Bucket],
        deletedObjectCount: 0,
      },
    })
    expect(setup.state).toBe("archived")
    expect(setup.runnerCalls).toEqual([
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
      ["r2", "bucket", "delete", environment.r2Bucket, "--force"],
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
    ])
  })

  test("archives an already-absent dedicated root bucket idempotently", async () => {
    const setup = workflowSetup({ rootPrefix: true, bucketExists: false })

    const archived = await setup.workflow.projectArchive(projectId)

    expect(archived).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "archived" },
        deletedBuckets: [],
        deletedObjectCount: 0,
      },
    })
    expect(setup.runnerCalls).toEqual([["r2", "bucket", "info", environment.r2Bucket, "--json"]])
  })

  test("keeps archiving state after a partial bucket deletion failure and resumes idempotently", async () => {
    const setup = workflowSetup({ bucketDeleteFailures: 1 })

    const firstAttempt = await setup.workflow.projectArchive(projectId)
    expect(firstAttempt).toMatchObject({ success: false, errorMessage: "Wrangler bucket deletion failed" })
    expect(setup.state).toBe("archiving")

    const secondAttempt = await setup.workflow.projectArchive(projectId)
    expect(secondAttempt).toMatchObject({ success: true, data: { project: { archiveState: "archived" } } })
    expect(setup.state).toBe("archived")

    const callsBeforeIdempotentAttempt = setup.runnerCalls.length
    const idempotentAttempt = await setup.workflow.projectArchive(projectId)
    expect(idempotentAttempt).toMatchObject({ success: true, data: { project: { archiveState: "archived" } } })
    expect(setup.runnerCalls.length).toBe(callsBeforeIdempotentAttempt)
  })
})

function workflowSetup(
  options: {
    verifiedBackup?: boolean
    receiptMismatch?: boolean
    restoreFailure?: "missing" | "corrupt"
    assetCount?: number
    globalBindings?: readonly ReturnType<typeof setupBinding>[]
    bucketDeleteFailures?: number
    rootPrefix?: boolean
    bucketExists?: boolean
    temporaryDirectory?: string
  } = {},
) {
  let state: ProjectArchiveState = "active"
  const runnerCalls: string[][] = []
  const restoreCalls: Parameters<RcloneBackupRestoreAdapter>[0][] = []
  const restoreDirectoryEntries: string[][] = []
  let activeRestoreCount = 0
  let maxRestoreConcurrency = 0
  let bucketExists = options.bucketExists ?? true
  let bucketDeleteFailures = options.bucketDeleteFailures ?? 0
  const storage = memoryStorageAdapterCreate()
  const workflowEnvironment = options.rootPrefix ? { ...environment, r2Prefix: "" } : environment
  const bindingResult = storageBindingResolve(workflowEnvironment)
  if (!bindingResult.success) throw new Error(bindingResult.errorMessage)
  const binding = bindingResult.data
  const repository = projectRepositoryCreate(
    () => state,
    (next) => {
      state = next
      return { ...project, archiveState: state }
    },
    workflowEnvironment,
  )
  const assetDetails = Array.from({ length: options.assetCount ?? 1 }, (_, index) => {
    const assetNumber = index + 1
    const assetId = `asset-${assetNumber}`
    const currentSourceRevision = assetNumber === 1 ? sourceRevisionId : `${sourceRevisionId}-${assetNumber}`
    const filename = assetNumber === 1 ? "source.png" : `source-${assetNumber}.png`
    return {
      id: assetId,
      projectId,
      class: "image" as const,
      folders: [],
      filename,
      basename: filename.replace(".png", ""),
      currentSourceRevisionId: currentSourceRevision,
      sourcePath: filename,
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceHistory: [
        {
          id: currentSourceRevision,
          assetId,
          revision: 1,
          class: "image" as const,
          originalFilename: filename,
          mediaType: "image/png",
          byteSize: sourceBytes.byteLength,
          sha256: sourceSha256,
          objectKey: filename,
          createdAt: timestamp,
        },
      ],
      outputHistory: [],
      metadata: null,
    } satisfies AssetDetail
  })
  const assetApiRepository: Pick<AssetApiRepository, "assetsRead" | "assetRead"> = {
    assetsRead: () => ({
      success: true,
      data: assetDetails.map(
        ({ outputHistory: _outputHistory, metadata: _metadata, sourceHistory: _sourceHistory, ...asset }) => ({
          ...asset,
          outputCount: 0,
        }),
      ),
    }),
    assetRead: (_projectId, assetId) => ({
      success: true,
      data: assetDetails.find((asset) => asset.id === assetId) ?? null,
    }),
  }
  const backupApiRepository: Pick<BackupApiRepository, "backupReceiptsRead"> = {
    backupReceiptsRead: (_projectIdentifier, receiptOptions) => ({
      success: true,
      data: {
        items:
          options.verifiedBackup === false
            ? []
            : [
                {
                  id: "receipt-1",
                  projectId,
                  sourceRevisionId: receiptOptions.sourceRevisionId ?? sourceRevisionId,
                  jobId: "job-1",
                  remotePath: `gdrive_beta:backups/${projectId}/${receiptOptions.sourceRevisionId ?? sourceRevisionId}.png`,
                  byteSize: options.receiptMismatch ? sourceBytes.byteLength + 1 : sourceBytes.byteLength,
                  sha256: options.receiptMismatch ? "b".repeat(64) : sourceSha256,
                  checkResult: "verified" as const,
                  completedAt: timestamp,
                },
              ],
        nextCursor: null,
      },
    }),
  }
  const runner: WranglerCommandRunner = async ({ args }) => {
    runnerCalls.push([...args])
    if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    if (args[2] === "info")
      return bucketExists
        ? { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
        : { success: true, data: { exitCode: 1, stdout: "", stderr: "bucket does not exist [code: 10006]" } }
    if (args[2] === "delete" && bucketDeleteFailures > 0) {
      bucketDeleteFailures -= 1
      return { success: true, data: { exitCode: 1, stdout: "", stderr: "bucket deletion failed" } }
    }
    if (args[2] === "delete") {
      bucketExists = false
      return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }
  const restore: RcloneBackupRestoreAdapter = async (request) => {
    restoreCalls.push(request)
    activeRestoreCount += 1
    maxRestoreConcurrency = Math.max(maxRestoreConcurrency, activeRestoreCount)
    try {
      if (options.restoreFailure === "missing")
        return { success: false, op: "archiveRestore", errorMessage: "The remote object could not be read" }
      const bytes = options.restoreFailure === "corrupt" ? new Uint8Array([9]) : sourceBytes
      restoreDirectoryEntries.push(await readdir(dirname(request.destinationPath)))
      await Bun.write(request.destinationPath, bytes)
      return {
        success: true,
        data: {
          destinationPath: request.destinationPath,
          byteSize: request.expectedByteSize,
          sha256: request.expectedSha256,
          checkResult: "verified" as const,
        },
      }
    } finally {
      activeRestoreCount -= 1
    }
  }
  const workflow = projectArchiveWorkflowCreate({
    projectRepository: repository,
    assetApiRepository,
    backupApiRepository,
    restore,
    storage,
    storageBindingsRead: () => ({
      success: true,
      data: options.globalBindings ?? [binding],
    }),
    wranglerRunner: runner,
    storageObjectListMaxKeys: 1,
    ...(options.temporaryDirectory === undefined ? {} : { temporaryDirectory: options.temporaryDirectory }),
  })
  return {
    workflow,
    storage,
    binding,
    runnerCalls,
    restoreCalls,
    restoreDirectoryEntries,
    get maxRestoreConcurrency() {
      return maxRestoreConcurrency
    },
    get state() {
      return state
    },
  }
}

function projectRepositoryCreate(
  stateRead: () => ProjectArchiveState,
  stateWrite: (state: ProjectArchiveState) => Project,
  projectEnvironment: typeof environment,
): ProjectRepository {
  return {
    projectsRead: () => ({ success: true, data: [] }),
    projectRead: () => ({ success: true, data: { ...project, archiveState: stateRead() } }),
    projectBindingRead: () => ({ success: true, data: null }),
    environmentsRead: () => ({ success: true, data: [projectEnvironment] }),
    environmentRead: () => ({ success: true, data: projectEnvironment }),
    projectSettingsRead: () => ({ success: true, data: null }),
    projectSettingsWrite: () => ({ success: true, data: null }),
    projectArchiveStateWrite: (_projectIdentifier, nextState) => {
      const data = stateWrite(nextState)
      return { success: true, data }
    },
    projectCreate: () => ({
      success: true,
      data: {
        project: {
          project: { ...project, archiveState: stateRead() },
          organization: null,
          binding: null,
          environments: [projectEnvironment],
        },
        created: false,
      },
    }),
    organizationRead: () => ({ success: true, data: null }),
  }
}

function setupBinding(bindingProjectId: string, bucket: string) {
  return {
    projectId: bindingProjectId,
    environment: "production" as const,
    bucket,
    prefix: `projects/${bindingProjectId}`,
    publicBaseUrl: "https://assets.example.test",
  }
}
