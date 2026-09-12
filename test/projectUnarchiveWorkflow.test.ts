import { describe, expect, test } from "bun:test"

import type { AssetApiRepository, AssetDetail } from "../src/asset/assetApiRepository.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../src/backup/rcloneBackupRestoreAdapter.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { ProjectArchiveState } from "../src/project/projectArchiveStateSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { Project } from "../src/project/projectSchema.js"
import { projectUnarchiveWorkflowCreate } from "../src/project/projectUnarchiveWorkflowCreate.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import type { StorageBinding } from "../src/storage/storageBindingSchema.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { WorkflowApiRepository } from "../src/workflow/workflowApiRepository.js"
import type { Workflow } from "../src/workflow/workflowSchema.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"

const timestamp = "2026-09-12T00:00:00.000Z"
const projectId = "project-unarchive"
const assetId = "asset-unarchive"
const sourceRevisionId = "source-unarchive"
const sourceBytes = new Uint8Array([1, 2, 3, 4])
const sourceSha256 = contentSha256Create(sourceBytes)
const outputBytes = new Uint8Array([5, 6, 7])
const outputSha256 = contentSha256Create(outputBytes)

describe("project unarchive workflow", () => {
  test("creates every bucket, restores originals, waits for output processing, verifies outputs, and activates", async () => {
    const setup = workflowSetup()

    const result = await setup.workflow.projectUnarchive(projectId)

    expect(result).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "active" },
        createdBuckets: ["dedicated-unarchive-development", "dedicated-unarchive-production"],
        restoredOriginalCount: 1,
        regeneratedOutputCount: 1,
      },
    })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(1)
    expect(setup.reprocessCalls).toEqual([assetId])
    expect(setup.workflowReads).toEqual(["workflow-unarchive"])
    expect(setup.runnerCalls).toContainEqual(["r2", "bucket", "create", "dedicated-unarchive-development"])
    expect(setup.runnerCalls).toContainEqual(["r2", "bucket", "create", "dedicated-unarchive-production"])
  })

  test("does not provision or restore when the current source has a missing or unverified Google Drive backup", async () => {
    const setup = workflowSetup({ receipt: null })

    const result = await setup.workflow.projectUnarchive(projectId)

    expect(result).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(setup.state).toBe("archived")
    expect(setup.runnerCalls).toEqual([])
    expect(setup.restoreCalls).toHaveLength(0)

    const unverifiedSetup = workflowSetup({ receipt: "failed" })
    const unverified = await unverifiedSetup.workflow.projectUnarchive(projectId)
    expect(unverified).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(unverifiedSetup.state).toBe("archived")
    expect(unverifiedSetup.runnerCalls).toEqual([])

    const unsafeSetup = workflowSetup({ remotePath: "gdrive_beta:backups/../outside.pdf" })
    const unsafe = await unsafeSetup.workflow.projectUnarchive(projectId)
    expect(unsafe).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(unsafeSetup.runnerCalls).toEqual([])
    expect(unsafeSetup.restoreCalls).toHaveLength(0)
  })

  test("keeps unarchiving state after a bucket failure and resumes without duplicating the restore", async () => {
    const setup = workflowSetup({ bucketCreateFailures: 1 })

    const first = await setup.workflow.projectUnarchive(projectId)
    expect(first).toMatchObject({ success: false, errorMessage: "Wrangler bucket creation exited with code 1" })
    expect(setup.state).toBe("unarchiving")
    expect(setup.restoreCalls).toHaveLength(0)

    const second = await setup.workflow.projectUnarchive(projectId)
    expect(second).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(1)
  })

  test("leaves the project unarchiving when an output workflow does not complete", async () => {
    const setup = workflowSetup({ workflowStatus: "failed" })

    const result = await setup.workflow.projectUnarchive(projectId)

    expect(result).toMatchObject({ success: false, errorMessage: expect.stringContaining("workflow") })
    expect(setup.state).toBe("unarchiving")
    expect(setup.workflowRetries).toBe(1)
  })

  test("retries a failed workflow and is idempotent after completion", async () => {
    const setup = workflowSetup({ workflowStatus: "failed" })

    await setup.workflow.projectUnarchive(projectId)
    setup.workflowStatus = "succeeded"
    const retry = await setup.workflow.projectUnarchive(projectId)
    expect(retry).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.restoreCalls).toHaveLength(1)

    const runnerCalls = setup.runnerCalls.length
    const restoreCalls = setup.restoreCalls.length
    const idempotent = await setup.workflow.projectUnarchive(projectId)
    expect(idempotent).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.runnerCalls).toHaveLength(runnerCalls)
    expect(setup.restoreCalls).toHaveLength(restoreCalls)
  })
})

function workflowSetup(
  options: {
    receipt?: "verified" | "failed" | null
    remotePath?: string
    bucketCreateFailures?: number
    workflowStatus?: Workflow["status"]
  } = {},
) {
  let state: ProjectArchiveState = "archived"
  let bucketCreateFailures = options.bucketCreateFailures ?? 0
  const buckets = new Set<string>()
  const runnerCalls: string[][] = []
  const restoreCalls: Parameters<RcloneBackupRestoreAdapter>[0][] = []
  const reprocessCalls: string[] = []
  const workflowReads: string[] = []
  let workflowRetries = 0
  let workflowStatus = options.workflowStatus ?? "succeeded"
  const storage = memoryStorageAdapterCreate()
  const binding = storageBindingResolve(environmentCreate("development"))
  if (!binding.success) throw new Error(binding.errorMessage)
  const productionBinding = storageBindingResolve(environmentCreate("production"))
  if (!productionBinding.success) throw new Error(productionBinding.errorMessage)

  const workflow = projectUnarchiveWorkflowCreate({
    projectRepository: projectRepositoryCreate(
      () => state,
      (next) => {
        state = next
        return { ...project, archiveState: state }
      },
    ),
    assetApiRepository: assetApiRepositoryCreate(storage, reprocessCalls, productionBinding.data),
    backupApiRepository: backupApiRepositoryCreate(
      options.receipt === null ? null : receiptCreate(options.receipt ?? "verified", options.remotePath),
    ),
    restore: restoreCreate(sourceBytes, restoreCalls),
    storage,
    storageBindingsRead: () => ({ success: true, data: [binding.data, productionBinding.data] }),
    wranglerRunner: wranglerRunnerCreate(runnerCalls, buckets, () => bucketCreateFailures--),
    workflowApiRepository: workflowApiRepositoryCreate(
      workflowReads,
      () => workflowRetries++,
      () => workflowStatus,
    ),
    workflowPollMs: 0,
    temporaryDirectory: "/tmp",
  })

  return {
    workflow,
    storage,
    runnerCalls,
    restoreCalls,
    reprocessCalls,
    workflowReads,
    get workflowRetries() {
      return workflowRetries
    },
    get workflowStatus() {
      return workflowStatus
    },
    set workflowStatus(value: Workflow["status"]) {
      workflowStatus = value
    },
    get state() {
      return state
    },
  }
}

function projectRepositoryCreate(
  stateRead: () => ProjectArchiveState,
  stateWrite: (state: ProjectArchiveState) => Project,
): Pick<ProjectRepository, "projectRead" | "environmentsRead" | "projectArchiveStateWrite"> {
  return {
    projectRead: () => ({ success: true, data: { ...project, archiveState: stateRead() } }),
    environmentsRead: () => ({
      success: true,
      data: [environmentCreate("development"), environmentCreate("production")],
    }),
    projectArchiveStateWrite: (_projectIdentifier, nextState) => ({ success: true, data: stateWrite(nextState) }),
  }
}

function assetApiRepositoryCreate(
  storage: ReturnType<typeof memoryStorageAdapterCreate>,
  reprocessCalls: string[],
  productionBinding: StorageBinding,
): Pick<
  AssetApiRepository,
  "assetsRead" | "assetRead" | "assetSourceEnvironmentRead" | "assetOutputBlobRead" | "assetReprocess"
> {
  const version = {
    id: "version-unarchive",
    outputDefinitionId: "output-unarchive",
    assetId,
    sourceRevisionId,
    version: 1,
    byteSize: outputBytes.byteLength,
    sha256: outputSha256,
    mediaType: "application/pdf",
    extension: "pdf" as const,
    objectKey: "documents/source_v1.pdf",
    toolchainVersion: "test@1",
    current: true,
    createdAt: timestamp,
  }
  const detail: AssetDetail = {
    id: assetId,
    projectId,
    class: "document",
    folders: [],
    filename: "source.pdf",
    basename: "source",
    currentSourceRevisionId: sourceRevisionId,
    sourcePath: "source.pdf",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceHistory: [
      {
        id: sourceRevisionId,
        assetId,
        revision: 1,
        class: "document",
        originalFilename: "source.pdf",
        mediaType: "application/pdf",
        byteSize: sourceBytes.byteLength,
        sha256: sourceSha256,
        objectKey: "sources/source-unarchive/source.pdf",
        createdAt: timestamp,
      },
    ],
    outputHistory: [
      {
        definition: {
          id: "output-unarchive",
          assetId,
          kind: "document",
          key: "default",
        },
        versions: [version],
      },
    ],
    metadata: null,
  }
  const outputSeed = () => {
    const privateLocation = storageObjectLocationCreate(
      productionBinding,
      "private-source",
      `outputs/${version.id}.pdf`,
    )
    const publicLocation = storageObjectLocationCreate(productionBinding, "public-output", version.objectKey)
    if (!privateLocation.success || !publicLocation.success) throw new Error("output location failed")
    void storage.putImmutable({ location: privateLocation.data, bytes: outputBytes, mediaType: version.mediaType })
    void storage.putImmutable({ location: publicLocation.data, bytes: outputBytes, mediaType: version.mediaType })
  }
  outputSeed()

  return {
    assetsRead: () => ({
      success: true,
      data: [
        {
          id: assetId,
          projectId,
          class: "document" as const,
          folders: [],
          filename: "source.pdf",
          basename: "source",
          currentSourceRevisionId: sourceRevisionId,
          sourcePath: "source.pdf",
          outputCount: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    }),
    assetRead: () => ({ success: true, data: detail }),
    assetSourceEnvironmentRead: () => ({ success: true, data: "production" as const }),
    assetOutputBlobRead: () => ({
      success: true,
      data: {
        storage: "public" as const,
        environment: "production" as const,
        objectKey: version.objectKey,
        byteSize: version.byteSize,
        mediaType: version.mediaType,
      },
    }),
    assetReprocess: () => {
      reprocessCalls.push(assetId)
      return { success: true, data: { asset: detail, workflowId: "workflow-unarchive" } }
    },
  }
}

function backupApiRepositoryCreate(
  receipt: ReturnType<typeof receiptCreate> | null,
): Pick<BackupApiRepository, "backupReceiptsRead"> {
  return {
    backupReceiptsRead: () => ({
      success: true,
      data: { items: receipt === null ? [] : [receipt], nextCursor: null },
    }),
  }
}

function receiptCreate(
  checkResult: "verified" | "failed" = "verified",
  remotePath = "gdrive_beta:backups/organization/project/source.pdf",
) {
  return {
    id: "receipt-unarchive",
    projectId,
    sourceRevisionId,
    jobId: "job-unarchive",
    remotePath,
    byteSize: sourceBytes.byteLength,
    sha256: sourceSha256,
    checkResult,
    completedAt: timestamp,
  }
}

function restoreCreate(
  bytes: Uint8Array,
  calls: Parameters<RcloneBackupRestoreAdapter>[0][],
): RcloneBackupRestoreAdapter {
  return async (request) => {
    calls.push(request)
    await Bun.write(request.destinationPath, bytes)
    return {
      success: true,
      data: {
        destinationPath: request.destinationPath,
        byteSize: request.expectedByteSize,
        sha256: request.expectedSha256,
        checkResult: "verified",
      },
    }
  }
}

function wranglerRunnerCreate(
  calls: string[][],
  buckets: Set<string>,
  failureRemaining: () => number,
): WranglerCommandRunner {
  return async ({ args }) => {
    calls.push([...args])
    if (args[0] === "--version") return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    if (args[2] === "info")
      return buckets.has(args[3] ?? "")
        ? { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
        : { success: true, data: { exitCode: 1, stdout: "", stderr: "bucket does not exist [code: 10006]" } }
    if (args[2] === "create") {
      if (failureRemaining() > 0) return { success: true, data: { exitCode: 1, stdout: "", stderr: "failed" } }
      buckets.add(args[3] ?? "")
      return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }
}

function workflowApiRepositoryCreate(
  reads: string[],
  retry: () => number,
  statusRead: () => Workflow["status"],
): Pick<WorkflowApiRepository, "workflowRead" | "workflowRetry"> {
  const detail = () => ({
    workflow: {
      id: "workflow-unarchive",
      projectId,
      assetId,
      sourceRevisionId,
      kind: "asset_processing" as const,
      status: statusRead(),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    jobs: [],
  })
  return {
    workflowRead: () => {
      reads.push("workflow-unarchive")
      return { success: true, data: detail() }
    },
    workflowRetry: () => {
      retry()
      return { success: true, data: detail() }
    },
  }
}

function environmentCreate(name: "development" | "production") {
  return {
    id: `environment-unarchive-${name}`,
    projectId,
    name,
    r2Bucket: `dedicated-unarchive-${name}`,
    r2Prefix: `projects/${projectId}`,
    publicBaseUrl: "https://assets.example.test",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const project: Project = {
  id: projectId,
  organizationId: "organization-unarchive",
  name: "Unarchive project",
  slug: "unarchive-project",
  defaultEnvironment: "production",
  archiveState: "archived",
  createdAt: timestamp,
  updatedAt: timestamp,
}
