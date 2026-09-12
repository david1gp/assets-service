import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import type { AssetApiRepository, AssetDetail } from "../src/asset/assetApiRepository.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
import type { RcloneBackupRestoreAdapter } from "../src/backup/rcloneBackupRestoreAdapter.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import type { ProjectArchiveState } from "../src/project/projectArchiveStateSchema.js"
import { projectArchiveWorkflowCreate } from "../src/project/projectArchiveWorkflowCreate.js"
import type { ProjectArchiveWorkflowCreateInput } from "../src/project/projectArchiveWorkflowCreateInput.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"
import type { Project } from "../src/project/projectSchema.js"
import type { ProjectStorageDomainRepository } from "../src/project/projectStorageDomainRepository.js"
import type { ProjectStorageLocation } from "../src/project/projectStorageLocationSchema.js"
import type { R2BucketCredentialRepository } from "../src/r2/r2BucketCredentialRepository.js"
import type { R2BucketCredential } from "../src/r2/r2BucketCredentialSchema.js"
import { storageBindingResolve } from "../src/storage/storageBindingResolve.js"
import { storageObjectLocationCreate } from "../src/storage/storageObjectLocationCreate.js"
import type { WranglerCommandRunner } from "../src/wrangler/wranglerCommandRunner.js"

const timestamp = "2026-09-12T00:00:00.000Z"
const projectId = "project-archive"
const sourceRevisionId = "source-current"
const sourceBytes = new Uint8Array([1])
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex")
const cloudflareCredentials = { accountId: "account-1", apiToken: "request-token" }
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

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "archived" },
        deletedBuckets: [environment.r2Bucket],
        deletedObjectCount: 2,
      },
    })
    expect(setup.state).toBe("archived")
    expect(setup.restoreCalls).toHaveLength(0)
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

  test("removes custom domains before deleting a dedicated bucket and removes its credential", async () => {
    const setup = workflowSetup({ customDomains: ["assets.example.test"], credential: true })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({ success: true, data: { deletedBuckets: [environment.r2Bucket] } })
    expect(setup.runnerCalls.slice(0, 3)).toEqual([
      ["r2", "bucket", "domain", "get", environment.r2Bucket, "--domain", "assets.example.test"],
      ["r2", "bucket", "domain", "remove", environment.r2Bucket, "--domain", "assets.example.test"],
      ["r2", "bucket", "domain", "get", environment.r2Bucket, "--domain", "assets.example.test"],
    ])
    expect(setup.runnerCalls.slice(3)).toEqual([
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
      ["r2", "bucket", "delete", environment.r2Bucket, "--force"],
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
    ])
    expect(setup.credentialRevokeCalls).toEqual(["archive-revocation"])
    expect(setup.credentialDeleteCalls).toEqual([environment.r2Bucket])
  })

  test("treats missing domains and dedicated buckets as idempotent while removing credentials", async () => {
    const setup = workflowSetup({
      customDomains: ["assets.example.test"],
      domainsAttached: false,
      credential: true,
      bucketExists: false,
    })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({ success: true, data: { deletedBuckets: [] } })
    expect(setup.credentialRevokeCalls).toEqual(["archive-revocation"])
    expect(setup.credentialDeleteCalls).toEqual([environment.r2Bucket])
    expect(setup.runnerCalls).toEqual([
      ["r2", "bucket", "domain", "get", environment.r2Bucket, "--domain", "assets.example.test"],
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
    ])
  })

  test("emits structured archive phases and redacts request secrets from errors", async () => {
    const setup = workflowSetup({ credential: true, credentialRevokeFailure: "request-token" })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({ success: false, errorMessage: "request-token" })
    expect(setup.logs.map((entry) => entry.phase)).toEqual([
      "preflight",
      "storage-cleanup",
      "domain-cleanup",
      "bucket-cleanup",
      "credential-cleanup",
      "bucket-cleanup",
    ])
    expect(JSON.stringify(setup.logs)).not.toContain("request-token")
  })

  test("refuses to archive when a current source has no verified backup", async () => {
    const setup = workflowSetup({ verifiedBackup: false })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({ success: false })
    if (!archived.success) expect(archived.errorMessage).toContain("verified Google Drive backup")
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(0)
    expect(setup.runnerCalls).toEqual([])
  })

  test("refuses to archive when a verified receipt does not match the current source", async () => {
    const setup = workflowSetup({ receiptMismatch: true })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(0)
    expect(setup.runnerCalls).toEqual([])
  })

  test("requires a matching verified receipt for every source revision without reading Drive bytes", async () => {
    const setup = workflowSetup({ missingReceiptRevisionId: "source-current-previous" })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: false,
      errorMessage: expect.stringContaining("verified Google Drive backup"),
    })
    expect(setup.state).toBe("active")
    expect(setup.restoreCalls).toHaveLength(0)
    expect(setup.runnerCalls).toEqual([])
  })

  test("archives without deleting a shared root bucket", async () => {
    const setup = workflowSetup({
      rootPrefix: true,
      globalBindings: [
        setupBinding(projectId, environment.r2Bucket),
        setupBinding("other-project", environment.r2Bucket),
      ],
    })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: true,
      data: { project: { archiveState: "archived" }, deletedBuckets: [], deletedObjectCount: 0 },
    })
    expect(setup.state).toBe("archived")
    expect(setup.runnerCalls).toEqual([])
  })

  test("deletes deduplicated historical shared prefixes and only the dedicated current bucket", async () => {
    const legacyBucket = "contentoren-assets-service-public"
    const legacyBinding = storageBindingResolve({
      ...environment,
      r2Bucket: legacyBucket,
      r2Prefix: "template",
    })
    expect(legacyBinding.success).toBe(true)
    if (!legacyBinding.success) return
    const setup = workflowSetup({
      historicalLocations: [
        {
          id: "location-legacy-development",
          projectId,
          environment: "development",
          bucket: legacyBucket,
          prefix: "template",
          createdAt: timestamp,
        },
        {
          id: "location-legacy-production",
          projectId,
          environment: "production",
          bucket: legacyBucket,
          prefix: "template",
          createdAt: timestamp,
        },
        {
          id: "location-current-history",
          projectId,
          environment: "production",
          bucket: environment.r2Bucket,
          prefix: environment.r2Prefix,
          createdAt: timestamp,
        },
      ],
      globalBindings: [
        setupBinding(projectId, environment.r2Bucket),
        setupBinding("other-project", legacyBucket, "other-project"),
      ],
    })
    const legacyLocation = storageObjectLocationCreate(legacyBinding.data, "private-source", "legacy.png")
    expect(legacyLocation.success).toBe(true)
    if (!legacyLocation.success) return
    await setup.storage.putImmutable({ location: legacyLocation.data, bytes: sourceBytes, mediaType: "image/png" })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: true,
      data: {
        project: { archiveState: "archived" },
        deletedBuckets: [environment.r2Bucket],
        deletedObjectCount: 1,
      },
    })
    expect(setup.runnerCalls).toEqual([
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
      ["r2", "bucket", "delete", environment.r2Bucket, "--force"],
      ["r2", "bucket", "info", environment.r2Bucket, "--json"],
    ])
    expect(setup.storageListCalls.filter(({ bucket }) => bucket === legacyBucket)).toHaveLength(1)
    expect(await setup.storage.listObjects?.({ bucket: legacyBucket, prefix: "template/" })).toMatchObject({
      success: true,
      data: { objects: [] },
    })
  })

  test("treats a missing historical shared bucket as an idempotent cleanup", async () => {
    const legacyBucket = "contentoren-assets-service-public"
    const setup = workflowSetup({
      historicalLocations: [
        {
          id: "location-missing-legacy",
          projectId,
          environment: "production",
          bucket: legacyBucket,
          prefix: "template",
          createdAt: timestamp,
        },
      ],
      globalBindings: [
        setupBinding(projectId, environment.r2Bucket),
        setupBinding("other-project", legacyBucket, "other-project"),
      ],
      missingListBuckets: [legacyBucket],
    })

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

    expect(archived).toMatchObject({
      success: true,
      data: { project: { archiveState: "archived" }, deletedBuckets: [environment.r2Bucket], deletedObjectCount: 0 },
    })
    expect(setup.runnerCalls).toContainEqual(["r2", "bucket", "delete", environment.r2Bucket, "--force"])
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

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

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

    const archived = await setup.workflow.projectArchive(projectId, cloudflareCredentials)

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

    const firstAttempt = await setup.workflow.projectArchive(projectId, cloudflareCredentials)
    expect(firstAttempt).toMatchObject({ success: false, errorMessage: "Wrangler bucket deletion failed" })
    expect(setup.state).toBe("archiving")

    const secondAttempt = await setup.workflow.projectArchive(projectId, cloudflareCredentials)
    expect(secondAttempt).toMatchObject({ success: true, data: { project: { archiveState: "archived" } } })
    expect(setup.state).toBe("archived")

    const callsBeforeIdempotentAttempt = setup.runnerCalls.length
    const idempotentAttempt = await setup.workflow.projectArchive(projectId, cloudflareCredentials)
    expect(idempotentAttempt).toMatchObject({ success: true, data: { project: { archiveState: "archived" } } })
    expect(setup.runnerCalls.length).toBe(callsBeforeIdempotentAttempt)
  })
})

function workflowSetup(
  options: {
    verifiedBackup?: boolean
    receiptMismatch?: boolean
    missingReceiptRevisionId?: string
    assetCount?: number
    globalBindings?: readonly ReturnType<typeof setupBinding>[]
    historicalLocations?: readonly ProjectStorageLocation[]
    missingListBuckets?: readonly string[]
    bucketDeleteFailures?: number
    rootPrefix?: boolean
    bucketExists?: boolean
    customDomains?: readonly string[]
    domainsAttached?: boolean
    credential?: boolean
    credentialRevokeFailure?: string
  } = {},
) {
  let state: ProjectArchiveState = "active"
  const runnerCalls: string[][] = []
  const restoreCalls: Parameters<RcloneBackupRestoreAdapter>[0][] = []
  const credentialRevokeCalls: string[] = []
  const credentialDeleteCalls: string[] = []
  const logs: Array<NonNullable<Parameters<NonNullable<ProjectArchiveWorkflowCreateInput["archiveLogger"]>>[0]>> = []
  let bucketExists = options.bucketExists ?? true
  let bucketDeleteFailures = options.bucketDeleteFailures ?? 0
  let domainAttached = options.domainsAttached ?? (options.customDomains?.length ?? 0) > 0
  const storageAdapter = memoryStorageAdapterCreate()
  const storageListCalls: Array<{ bucket: string; prefix?: string }> = []
  const missingListBuckets = new Set(options.missingListBuckets ?? [])
  const storage = {
    ...storageAdapter,
    listObjects: async (request: Parameters<NonNullable<typeof storageAdapter.listObjects>>[0]) => {
      storageListCalls.push({
        bucket: request.bucket,
        ...(request.prefix === undefined ? {} : { prefix: request.prefix }),
      })
      if (missingListBuckets.has(request.bucket))
        return {
          success: false as const,
          op: "archiveTestStorage",
          errorMessage: "status 404",
          rawData: { status: 404 },
        }
      return (
        storageAdapter.listObjects?.(request) ?? {
          success: false as const,
          op: "archiveTestStorage",
          errorMessage: "Storage listing is not configured",
        }
      )
    },
  }
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
    options.historicalLocations ?? [],
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
          id: `${currentSourceRevision}-previous`,
          assetId,
          revision: 1,
          class: "image" as const,
          originalFilename: filename,
          mediaType: "image/png",
          byteSize: sourceBytes.byteLength,
          sha256: sourceSha256,
          objectKey: `${assetId}/source-previous.png`,
          createdAt: timestamp,
        },
        {
          id: currentSourceRevision,
          assetId,
          revision: 2,
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
            : receiptOptions.sourceRevisionId === options.missingReceiptRevisionId
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
    if (args[2] === "domain" && args[3] === "get")
      return domainAttached
        ? { success: true, data: { exitCode: 0, stdout: "{}", stderr: "" } }
        : { success: true, data: { exitCode: 1, stdout: "", stderr: "custom domain not found" } }
    if (args[2] === "domain" && args[3] === "remove") {
      domainAttached = false
      return { success: true, data: { exitCode: 0, stdout: "", stderr: "" } }
    }
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
    return { success: false, op: "archiveRestore", errorMessage: "Archive must not restore Drive objects" }
  }
  const domainRepository: Pick<ProjectStorageDomainRepository, "projectStorageDomainsForBucketRead"> = {
    projectStorageDomainsForBucketRead: (bucket) => ({
      success: true,
      data: (options.customDomains ?? []).map((customDomain, index) => ({
        id: `domain-${index + 1}`,
        projectId,
        bucket,
        customDomain,
        zoneId: "zone-1",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    }),
  }
  const credential: R2BucketCredential = {
    bucket: environment.r2Bucket,
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    revocationId: "archive-revocation",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const credentialRepository: Pick<
    R2BucketCredentialRepository,
    "r2BucketCredentialRead" | "r2BucketCredentialDelete"
  > = {
    r2BucketCredentialRead: (bucket) => ({
      success: true,
      data: options.credential && bucket === credential.bucket ? credential : null,
    }),
    r2BucketCredentialDelete: (bucket) => {
      credentialDeleteCalls.push(bucket)
      return { success: true, data: true }
    },
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
    projectStorageDomainRepository: domainRepository,
    r2BucketCredentialRepository: credentialRepository,
    r2BucketCredentialRevoke: async ({ revocationId }) => {
      credentialRevokeCalls.push(revocationId)
      if (options.credentialRevokeFailure !== undefined)
        return { success: false, op: "archiveCredentialRevoke", errorMessage: options.credentialRevokeFailure }
      return { success: true, data: true }
    },
    archiveLogger: (entry) => logs.push(entry),
  })
  return {
    workflow,
    storage,
    binding,
    runnerCalls,
    restoreCalls,
    storageListCalls,
    credentialRevokeCalls,
    credentialDeleteCalls,
    logs,
    get state() {
      return state
    },
  }
}

function projectRepositoryCreate(
  stateRead: () => ProjectArchiveState,
  stateWrite: (state: ProjectArchiveState) => Project,
  projectEnvironment: typeof environment,
  historicalLocations: readonly ProjectStorageLocation[],
): ProjectRepository {
  return {
    projectsRead: () => ({ success: true, data: [] }),
    projectRead: () => ({ success: true, data: { ...project, archiveState: stateRead() } }),
    projectBindingRead: () => ({ success: true, data: null }),
    environmentsRead: () => ({ success: true, data: [projectEnvironment] }),
    environmentRead: () => ({ success: true, data: projectEnvironment }),
    projectStorageLocationsRead: () => ({ success: true, data: historicalLocations }),
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
    organizationReadBySlug: () => ({ success: true, data: null }),
    projectReadByOrganizationIdAndSlug: () => ({ success: true, data: null }),
  }
}

function setupBinding(bindingProjectId: string, bucket: string, prefix = `projects/${bindingProjectId}`) {
  return {
    projectId: bindingProjectId,
    environment: "production" as const,
    bucket,
    prefix,
    publicBaseUrl: "https://assets.example.test",
  }
}
