import { describe, expect, test } from "bun:test"

import type { AssetApiRepository, AssetDetail } from "../src/asset/assetApiRepository.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../src/backup/rcloneBackupRestoreAdapter.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { ProjectArchiveState } from "../src/project/projectArchiveStateSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { Project } from "../src/project/projectSchema.js"
import type { ProjectStorageDomain } from "../src/project/projectStorageDomainSchema.js"
import { projectUnarchiveWorkflowCreate } from "../src/project/projectUnarchiveWorkflowCreate.js"
import type { R2BucketCredential } from "../src/r2/r2BucketCredentialSchema.js"
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
const cloudflareCredentials = { accountId: "account-unarchive", apiToken: "secret-unarchive-token" }

describe("project unarchive workflow", () => {
  test("recreates the default bucket and credential, restores sources, domains, outputs, and activates", async () => {
    const setup = workflowSetup({ customDomain: true, includeHistoricalSource: true })

    const result = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)

    expect(result).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "active" },
        createdBuckets: ["dedicated-unarchive-production"],
        restoredOriginalCount: 2,
        regeneratedOutputCount: 1,
      },
    })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(2)
    expect(setup.reprocessCalls).toEqual([assetId])
    expect(setup.workflowReads).toEqual(["workflow-unarchive"])
    expect(setup.runnerCalls).toContainEqual(["r2", "bucket", "create", "dedicated-unarchive-production"])
    expect(setup.credentialCreateCalls).toEqual(["dedicated-unarchive-production"])
    expect(setup.persistedCredentials).toHaveLength(1)
    expect(setup.domainCalls).toEqual(["assets.unarchive.example"])
    const productionBinding = storageBindingResolve(environmentCreate("production"))
    const developmentBinding = storageBindingResolve(environmentCreate("development"))
    if (!productionBinding.success || !developmentBinding.success) throw new Error("binding failed")
    for (const objectKey of ["sources/source-unarchive/source.pdf", "sources/source-unarchive/history.pdf"]) {
      const productionLocation = storageObjectLocationCreate(productionBinding.data, "private-source", objectKey)
      const developmentLocation = storageObjectLocationCreate(developmentBinding.data, "private-source", objectKey)
      if (!productionLocation.success || !developmentLocation.success) throw new Error("source location failed")
      expect(await setup.storage.headObject(productionLocation.data)).toMatchObject({
        success: true,
        data: { byteSize: sourceBytes.byteLength },
      })
      expect(await setup.storage.headObject(developmentLocation.data)).toMatchObject({ success: true, data: null })
    }
    expect(setup.phases).toEqual([
      "preflight",
      "bucket-recreation",
      "credential-recreation",
      "domain-restoration",
      "source-restoration",
      "output-regeneration",
      "complete",
    ])
  })

  test("does not provision or restore when the current source has a missing or unverified Google Drive backup", async () => {
    const setup = workflowSetup({ receipt: null })

    const result = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)

    expect(result).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(setup.state).toBe("archived")
    expect(setup.runnerCalls).toEqual([])
    expect(setup.restoreCalls).toHaveLength(0)

    const unverifiedSetup = workflowSetup({ receipt: "failed" })
    const unverified = await unverifiedSetup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(unverified).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(unverifiedSetup.state).toBe("archived")
    expect(unverifiedSetup.runnerCalls).toEqual([])

    const unsafeSetup = workflowSetup({ remotePath: "gdrive_beta:backups/../outside.pdf" })
    const unsafe = await unsafeSetup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(unsafe).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(unsafeSetup.runnerCalls).toEqual([])
    expect(unsafeSetup.restoreCalls).toHaveLength(0)
  })

  test("keeps unarchiving state after a bucket failure and resumes without duplicating the restore", async () => {
    const setup = workflowSetup({ bucketCreateFailures: 1 })

    const first = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(first).toMatchObject({ success: false, errorMessage: "Wrangler bucket creation exited with code 1" })
    expect(setup.state).toBe("unarchiving")
    expect(setup.restoreCalls).toHaveLength(0)

    const second = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(second).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(1)
  })

  test("leaves the project unarchiving when an output workflow does not complete", async () => {
    const setup = workflowSetup({ workflowStatus: "failed" })

    const result = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)

    expect(result).toMatchObject({ success: false, errorMessage: expect.stringContaining("workflow") })
    expect(setup.state).toBe("unarchiving")
    expect(setup.workflowRetries).toBe(1)
  })

  test("retries a failed workflow and is idempotent after completion", async () => {
    const setup = workflowSetup({ workflowStatus: "failed" })

    await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    setup.workflowStatus = "succeeded"
    const retry = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(retry).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.restoreCalls).toHaveLength(1)

    const runnerCalls = setup.runnerCalls.length
    const restoreCalls = setup.restoreCalls.length
    const idempotent = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)
    expect(idempotent).toMatchObject({ success: true, data: { project: { archiveState: "active" } } })
    expect(setup.runnerCalls).toHaveLength(runnerCalls)
    expect(setup.restoreCalls).toHaveLength(restoreCalls)
    expect(setup.credentialCreateCalls).toHaveLength(1)
  })

  test("redacts Cloudflare secrets from structured error logs", async () => {
    const setup = workflowSetup({ credentialError: "credential failed with secret-unarchive-token" })

    const result = await setup.workflow.projectUnarchive(projectId, cloudflareCredentials)

    expect(result).toMatchObject({ success: false, errorMessage: expect.stringContaining("secret-unarchive-token") })
    const errorLog = setup.logs.find((entry) => entry.event === "error")
    expect(errorLog).toMatchObject({ error: "credential failed with [REDACTED]" })
    expect(JSON.stringify(errorLog)).not.toContain("secret-unarchive-token")
  })
})

function workflowSetup(
  options: {
    receipt?: "verified" | "failed" | null
    remotePath?: string
    bucketCreateFailures?: number
    workflowStatus?: Workflow["status"]
    includeHistoricalSource?: boolean
    customDomain?: boolean
    credentialError?: string
  } = {},
) {
  let state: ProjectArchiveState = "archived"
  let bucketCreateFailures = options.bucketCreateFailures ?? 0
  const buckets = new Set<string>()
  const runnerCalls: string[][] = []
  const restoreCalls: Parameters<RcloneBackupRestoreAdapter>[0][] = []
  const reprocessCalls: string[] = []
  const workflowReads: string[] = []
  const credentialCreateCalls: string[] = []
  const persistedCredentials: R2BucketCredential[] = []
  const domainCalls: string[] = []
  const phases: string[] = []
  const logs: Array<{ event: string; error?: string }> = []
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
    assetApiRepository: assetApiRepositoryCreate(
      storage,
      reprocessCalls,
      productionBinding.data,
      options.includeHistoricalSource ?? false,
    ),
    backupApiRepository: backupApiRepositoryCreate(
      options.receipt === null ? null : receiptCreate(options.receipt ?? "verified", options.remotePath),
    ),
    restore: restoreCreate(sourceBytes, restoreCalls),
    storage,
    storageBindingsRead: () => ({ success: true, data: [binding.data, productionBinding.data] }),
    wranglerRunner: wranglerRunnerCreate(
      runnerCalls,
      buckets,
      () => bucketCreateFailures--,
      domainCalls,
      options.customDomain ?? false,
    ),
    workflowApiRepository: workflowApiRepositoryCreate(
      workflowReads,
      () => workflowRetries++,
      () => workflowStatus,
    ),
    workflowPollMs: 0,
    temporaryDirectory: "/tmp",
    projectStorageDomainRepository: {
      projectStorageDomainsForBucketRead: () => ({
        success: true,
        data: options.customDomain ? [domainCreate()] : [],
      }),
    },
    r2BucketCredentialRepository: {
      r2BucketCredentialRead: (bucket) => ({
        success: true,
        data: persistedCredentials.find((credential) => credential.bucket === bucket) ?? null,
      }),
      r2BucketCredentialCreate: (input) => {
        const credential = { ...input, createdAt: timestamp, updatedAt: timestamp }
        persistedCredentials.push(credential)
        return { success: true, data: credential }
      },
    },
    r2BucketCredentialCreate: async (input) => {
      credentialCreateCalls.push(input.bucket)
      if (options.credentialError !== undefined)
        return { success: false, op: "testCredentialCreate", errorMessage: options.credentialError }
      return {
        success: true,
        data: {
          bucket: input.bucket,
          accessKeyId: `access-${input.bucket}`,
          secretAccessKey: `secret-${input.bucket}`,
          revocationId: `revoke-${input.bucket}`,
        },
      }
    },
    unarchiveLogger: (entry) => {
      if (entry.event === "phase") phases.push(entry.phase)
      logs.push(entry)
    },
  })

  return {
    workflow,
    storage,
    runnerCalls,
    restoreCalls,
    reprocessCalls,
    workflowReads,
    credentialCreateCalls,
    persistedCredentials,
    domainCalls,
    phases,
    logs,
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
  includeHistoricalSource: boolean,
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
  const historicalSource = {
    id: "source-unarchive-history",
    assetId,
    revision: 1,
    class: "document" as const,
    originalFilename: "source.pdf",
    mediaType: "application/pdf" as const,
    byteSize: sourceBytes.byteLength,
    sha256: sourceSha256,
    objectKey: "sources/source-unarchive/history.pdf",
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
        revision: includeHistoricalSource ? 2 : 1,
        class: "document",
        originalFilename: "source.pdf",
        mediaType: "application/pdf",
        byteSize: sourceBytes.byteLength,
        sha256: sourceSha256,
        objectKey: "sources/source-unarchive/source.pdf",
        createdAt: timestamp,
      },
      ...(includeHistoricalSource ? [historicalSource] : []),
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
    assetSourceEnvironmentRead: () => ({ success: true, data: "development" as const }),
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
    backupReceiptsRead: (_projectId, options) => ({
      success: true,
      data: {
        items:
          receipt === null
            ? []
            : [
                receipt,
                ...(options.sourceRevisionId === "source-unarchive-history"
                  ? [
                      receiptCreate(
                        "verified",
                        "gdrive_beta:backups/project-unarchive/history.pdf",
                        "source-unarchive-history",
                      ),
                    ]
                  : []),
              ],
        nextCursor: null,
      },
    }),
  }
}

function receiptCreate(
  checkResult: "verified" | "failed" = "verified",
  remotePath = "gdrive_beta:backups/project-unarchive/source.pdf",
  revisionId = sourceRevisionId,
) {
  return {
    id: "receipt-unarchive",
    projectId,
    sourceRevisionId: revisionId,
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
  domainCalls: string[],
  useDomain: boolean,
): WranglerCommandRunner {
  let domainAttached = false
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
    if (args[2] === "domain" && useDomain) {
      if (args[3] === "get")
        return domainAttached
          ? { success: true, data: { exitCode: 0, stdout: '{"status":"active"}', stderr: "" } }
          : { success: true, data: { exitCode: 1, stdout: "", stderr: "custom domain not found" } }
      if (args[3] === "add") {
        domainAttached = true
        domainCalls.push(args[6] ?? "")
        return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
      }
    }
    throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`)
  }
}

function domainCreate(): ProjectStorageDomain {
  return {
    id: "storage-domain-unarchive",
    projectId,
    bucket: "dedicated-unarchive-production",
    customDomain: "assets.unarchive.example",
    zoneId: "zone-unarchive",
    createdAt: timestamp,
    updatedAt: timestamp,
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
