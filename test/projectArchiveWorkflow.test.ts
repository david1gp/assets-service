import { describe, expect, test } from "bun:test"

import type { AssetApiRepository } from "../src/asset/assetApiRepository.js"
import type { BackupApiRepository } from "../src/backup/backupApiRepository.js"
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
    if (!archived.success) expect(archived.errorMessage).toContain("verified backup")
    expect(setup.state).toBe("active")
    expect(setup.runnerCalls).toEqual([])
  })

  test("refuses to delete a bucket shared with another project", async () => {
    const setup = workflowSetup({
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
    globalBindings?: readonly ReturnType<typeof setupBinding>[]
    bucketDeleteFailures?: number
  } = {},
) {
  let state: ProjectArchiveState = "active"
  const runnerCalls: string[][] = []
  let bucketExists = true
  let bucketDeleteFailures = options.bucketDeleteFailures ?? 0
  const storage = memoryStorageAdapterCreate()
  const bindingResult = storageBindingResolve(environment)
  if (!bindingResult.success) throw new Error(bindingResult.errorMessage)
  const binding = bindingResult.data
  const repository = projectRepositoryCreate(
    () => state,
    (next) => {
      state = next
      return { ...project, archiveState: state }
    },
  )
  const assetApiRepository: Pick<AssetApiRepository, "assetsRead"> = {
    assetsRead: () => ({
      success: true,
      data: [
        {
          id: "asset-1",
          projectId,
          class: "image",
          folders: [],
          filename: "source.png",
          basename: "source",
          currentSourceRevisionId: sourceRevisionId,
          sourcePath: "source.png",
          outputCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    }),
  }
  const backupApiRepository: Pick<BackupApiRepository, "backupReceiptsRead"> = {
    backupReceiptsRead: () => ({
      success: true,
      data: {
        items:
          options.verifiedBackup === false
            ? []
            : [
                {
                  id: "receipt-1",
                  projectId,
                  sourceRevisionId,
                  jobId: "job-1",
                  remotePath: `gdrive_beta:backups/${projectId}/source.png`,
                  byteSize: 1,
                  sha256: "a".repeat(64),
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
  const workflow = projectArchiveWorkflowCreate({
    projectRepository: repository,
    assetApiRepository,
    backupApiRepository,
    storage,
    storageBindingsRead: () => ({
      success: true,
      data: options.globalBindings ?? [binding],
    }),
    wranglerRunner: runner,
    storageObjectListMaxKeys: 1,
  })
  return {
    workflow,
    storage,
    binding,
    runnerCalls,
    get state() {
      return state
    },
  }
}

function projectRepositoryCreate(
  stateRead: () => ProjectArchiveState,
  stateWrite: (state: ProjectArchiveState) => Project,
): ProjectRepository {
  return {
    projectsRead: () => ({ success: true, data: [] }),
    projectRead: () => ({ success: true, data: { ...project, archiveState: stateRead() } }),
    projectBindingRead: () => ({ success: true, data: null }),
    environmentsRead: () => ({ success: true, data: [environment] }),
    environmentRead: () => ({ success: true, data: environment }),
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
          environments: [environment],
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
