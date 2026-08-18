import { describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { eq } from "drizzle-orm"

import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { jobTable } from "../src/infrastructure/db/schema/jobTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { workflowTable } from "../src/infrastructure/db/schema/workflowTable.js"
import type { Result } from "../src/schemas/resultSchema.js"
import { jobDependencyRepositoryCreate } from "../src/workflow/jobDependencyRepositoryCreate.js"
import { jobHandlerRegistryCreate } from "../src/workflow/jobHandlerRegistryCreate.js"
import { jobRepositoryCancel } from "../src/workflow/jobRepositoryCancel.js"
import { jobRepositoryClaim } from "../src/workflow/jobRepositoryClaim.js"
import { jobRepositoryComplete } from "../src/workflow/jobRepositoryComplete.js"
import { jobRepositoryFail } from "../src/workflow/jobRepositoryFail.js"
import { jobRepositoryHeartbeat } from "../src/workflow/jobRepositoryHeartbeat.js"
import { jobRepositoryRecoverExpiredLeases } from "../src/workflow/jobRepositoryRecoverExpiredLeases.js"
import { workflowEngineCreate } from "../src/workflow/workflowEngineCreate.js"
import { workflowRepositoryEnqueue } from "../src/workflow/workflowRepositoryEnqueue.js"
import { workflowResourcePoolCreate } from "../src/workflow/workflowResourcePoolCreate.js"

const now = "2026-08-17T00:00:00.000Z"

const resultDataRead = <T>(result: Result<T>): T => {
  if (!result.success) throw new Error(`${result.op}: ${result.errorMessage}`)
  return result.data
}

const jobCreate = (id: string, workflowId: string, idempotencyKey = id, retryLimit = 2) => ({
  id,
  workflowId,
  kind: "verify_original" as const,
  status: "queued" as const,
  availableAt: now,
  priority: 0,
  attempts: 0,
  retryLimit,
  leaseOwner: null,
  leaseExpiresAt: null,
  heartbeatAt: null,
  idempotencyKey,
  payloadSchemaVersion: 1,
  payload: {},
  error: null,
  createdAt: now,
  updatedAt: now,
})

const databaseCreate = async () => {
  await mkdir("data", { recursive: true })
  const databasePath = `data/workflow-${crypto.randomUUID()}.sqlite`
  const opened = databaseOpen(databasePath)
  if (!opened.success) throw new Error(opened.errorMessage)
  const migrated = databaseMigrate(opened.data)
  if (!migrated.success) throw new Error(migrated.errorMessage)

  const organization = databaseRecordInsert(opened.data.db, organizationTable, {
    id: "org-workflow",
    name: "Workflow tests",
    slug: `workflow-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  })
  if (!organization.success) throw new Error(organization.errorMessage)
  const project = databaseRecordInsert(opened.data.db, projectTable, {
    id: "project-workflow",
    organizationId: organization.data.id,
    name: "Workflow tests",
    slug: `workflow-${crypto.randomUUID()}`,
    defaultEnvironment: "development",
    createdAt: now,
    updatedAt: now,
  })
  if (!project.success) throw new Error(project.errorMessage)

  return { connection: opened.data, databasePath, projectId: project.data.id }
}

const workflowCreate = (id: string, projectId: string) => ({
  id,
  projectId,
  kind: "asset_processing" as const,
  status: "queued" as const,
  createdAt: now,
  updatedAt: now,
})

const databaseDestroy = async (databasePath: string, connection: { client: { close: () => void } }) => {
  connection.client.close()
  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })
}

describe("durable workflow execution", () => {
  test("enqueues atomically, deduplicates jobs, and only claims ready dependencies", async () => {
    const database = await databaseCreate()
    try {
      const workflow = workflowCreate("workflow-ready", database.projectId)
      const first = jobCreate("job-first", workflow.id, "first-key")
      const second = jobCreate("job-second", workflow.id, "second-key")
      const dependency = {
        id: "dependency-first-second",
        jobId: second.id,
        dependsOnJobId: first.id,
        createdAt: now,
      }
      const enqueued = workflowRepositoryEnqueue(database.connection.db, {
        workflow,
        jobs: [first, second],
        dependencies: [dependency],
      })
      expect(resultDataRead(enqueued).jobs).toHaveLength(2)

      const duplicate = workflowRepositoryEnqueue(database.connection.db, {
        workflow,
        jobs: [jobCreate("different-id", workflow.id, "first-key")],
      })
      expect(resultDataRead(duplicate).jobs[0]?.id).toBe(first.id)
      expect(database.connection.db.select().from(jobTable).all()).toHaveLength(2)

      const blocked = resultDataRead(jobRepositoryClaim(database.connection.db, { workerId: "worker-blocked", now }))
      expect(blocked?.id).toBe(first.id)
      expect(resultDataRead(jobRepositoryClaim(database.connection.db, { workerId: "worker-other", now }))).toBeNull()
      expect(
        resultDataRead(
          jobRepositoryComplete(database.connection.db, { jobId: first.id, workerId: "worker-blocked", now }),
        ),
      ).toMatchObject({
        status: "succeeded",
      })
      expect(resultDataRead(jobRepositoryClaim(database.connection.db, { workerId: "worker-other", now }))?.id).toBe(
        second.id,
      )
      expect(
        resultDataRead(
          jobRepositoryComplete(database.connection.db, { jobId: second.id, workerId: "worker-other", now }),
        ),
      ).toMatchObject({
        status: "succeeded",
      })
      expect(database.connection.db.select().from(workflowTable).all()[0]?.status).toBe("succeeded")

      const cycle = jobDependencyRepositoryCreate(database.connection.db, {
        id: "dependency-cycle",
        jobId: first.id,
        dependsOnJobId: second.id,
        createdAt: now,
      })
      expect(cycle.success).toBe(false)
    } finally {
      await databaseDestroy(database.databasePath, database.connection)
    }
  })

  test("rolls back a workflow and its jobs when dependency enqueue fails", async () => {
    const database = await databaseCreate()
    try {
      const workflow = workflowCreate("workflow-rollback", database.projectId)
      const result = workflowRepositoryEnqueue(database.connection.db, {
        workflow,
        jobs: [jobCreate("job-rollback-a", workflow.id), jobCreate("job-rollback-b", workflow.id)],
        dependencies: [
          {
            id: "dependency-missing",
            jobId: "job-rollback-b",
            dependsOnJobId: "missing-job",
            createdAt: now,
          },
        ],
      })
      expect(result.success).toBe(false)
      expect(database.connection.db.select().from(workflowTable).all()).toHaveLength(0)
      expect(database.connection.db.select().from(jobTable).all()).toHaveLength(0)
    } finally {
      await databaseDestroy(database.databasePath, database.connection)
    }
  })

  test("renews leases, recovers expired work, applies backoff, dead-letters, and cancels", async () => {
    const database = await databaseCreate()
    try {
      const workflow = workflowCreate("workflow-retry", database.projectId)
      const job = jobCreate("job-retry", workflow.id, "retry-key", 2)
      expect(
        resultDataRead(workflowRepositoryEnqueue(database.connection.db, { workflow, jobs: [job] })).jobs[0]?.id,
      ).toBe(job.id)
      expect(
        resultDataRead(jobRepositoryClaim(database.connection.db, { workerId: "worker-a", now, leaseMs: 1_000 }))?.id,
      ).toBe(job.id)
      expect(
        resultDataRead(
          jobRepositoryHeartbeat(database.connection.db, {
            jobId: job.id,
            workerId: "worker-a",
            now: "2026-08-17T00:00:00.500Z",
            leaseMs: 1_000,
          }),
        ).heartbeatAt,
      ).toBe("2026-08-17T00:00:00.500Z")
      expect(
        resultDataRead(jobRepositoryRecoverExpiredLeases(database.connection.db, { now: "2026-08-17T00:00:01.000Z" })),
      ).toBe(0)
      expect(
        resultDataRead(jobRepositoryRecoverExpiredLeases(database.connection.db, { now: "2026-08-17T00:00:02.000Z" })),
      ).toBe(1)
      expect(
        resultDataRead(
          jobRepositoryClaim(database.connection.db, {
            workerId: "worker-b",
            now: "2026-08-17T00:00:02.000Z",
            leaseMs: 1_000,
          }),
        )?.attempts,
      ).toBe(2)
      const failed = resultDataRead(
        jobRepositoryFail(database.connection.db, {
          jobId: job.id,
          workerId: "worker-b",
          now: "2026-08-17T00:00:02.000Z",
          backoffMs: 500,
          error: { code: "job_failed", message: "temporary", retryable: true },
        }),
      )
      expect(failed.status).toBe("retryable")
      expect(failed.availableAt).toBe("2026-08-17T00:00:02.500Z")
      expect(
        resultDataRead(
          jobRepositoryClaim(database.connection.db, {
            workerId: "worker-c",
            now: "2026-08-17T00:00:02.100Z",
          }),
        ),
      ).toBeNull()
      expect(
        resultDataRead(
          jobRepositoryClaim(database.connection.db, {
            workerId: "worker-c",
            now: "2026-08-17T00:00:02.500Z",
          }),
        )?.attempts,
      ).toBe(3)
      expect(
        resultDataRead(
          jobRepositoryFail(database.connection.db, {
            jobId: job.id,
            workerId: "worker-c",
            now: "2026-08-17T00:00:02.500Z",
            error: { code: "job_failed", message: "permanent", retryable: false },
          }),
        ).status,
      ).toBe("dead")

      const permanentWorkflow = workflowCreate("workflow-permanent", database.projectId)
      const permanentJob = jobCreate("job-permanent", permanentWorkflow.id, "permanent-key", 5)
      resultDataRead(
        workflowRepositoryEnqueue(database.connection.db, { workflow: permanentWorkflow, jobs: [permanentJob] }),
      )
      resultDataRead(jobRepositoryClaim(database.connection.db, { workerId: "worker-permanent", now }))
      expect(
        resultDataRead(
          jobRepositoryFail(database.connection.db, {
            jobId: permanentJob.id,
            workerId: "worker-permanent",
            now,
            error: { code: "job_failed", message: "validation failed", retryable: false },
          }),
        ).status,
      ).toBe("dead")

      const cancelledWorkflow = workflowCreate("workflow-cancel", database.projectId)
      const cancelledJob = jobCreate("job-cancel", cancelledWorkflow.id)
      resultDataRead(
        workflowRepositoryEnqueue(database.connection.db, { workflow: cancelledWorkflow, jobs: [cancelledJob] }),
      )
      expect(resultDataRead(jobRepositoryCancel(database.connection.db, { jobId: cancelledJob.id, now })).status).toBe(
        "cancelled",
      )
      expect(
        database.connection.db
          .select()
          .from(workflowTable)
          .all()
          .find((item) => item.id === cancelledWorkflow.id)?.status,
      ).toBe("cancelled")
    } finally {
      await databaseDestroy(database.databasePath, database.connection)
    }
  })

  test("claims distinct jobs for concurrent connections and bounds handler concurrency", async () => {
    const database = await databaseCreate()
    const secondConnection = databaseOpen(database.databasePath)
    if (!secondConnection.success) throw new Error(secondConnection.errorMessage)
    try {
      const workflow = workflowCreate("workflow-concurrent", database.projectId)
      const jobs = Array.from({ length: 4 }, (_, index) => jobCreate(`job-concurrent-${index}`, workflow.id))
      resultDataRead(workflowRepositoryEnqueue(database.connection.db, { workflow, jobs }))
      const claims = await Promise.all([
        Promise.resolve(jobRepositoryClaim(database.connection.db, { workerId: "connection-a", now })),
        Promise.resolve(jobRepositoryClaim(secondConnection.data.db, { workerId: "connection-b", now })),
      ])
      expect(claims.every((claim) => claim.success)).toBe(true)
      const claimedIds = claims.flatMap((claim) => (claim.success && claim.data !== null ? [claim.data.id] : []))
      expect(new Set(claimedIds).size).toBe(2)
      for (const claim of claims) {
        if (claim.success && claim.data !== null && claim.data.leaseOwner !== null) {
          resultDataRead(
            jobRepositoryComplete(database.connection.db, {
              jobId: claim.data.id,
              workerId: claim.data.leaseOwner,
              now,
            }),
          )
        }
      }

      const registry = jobHandlerRegistryCreate()
      let active = 0
      let maximumActive = 0
      expect(
        registry.register("verify_original", async () => {
          active += 1
          maximumActive = Math.max(maximumActive, active)
          await new Promise((resolve) => setTimeout(resolve, 5))
          active -= 1
          return { success: true, data: null }
        }).success,
      ).toBe(true)
      const engine = workflowEngineCreate({
        db: database.connection.db,
        workerId: "pool",
        handlerRegistry: registry,
        concurrency: 2,
        leaseMs: 1_000,
        heartbeatMs: 100,
        retryBackoffMs: () => 0,
        clock: () => new Date(now),
      })
      for (let iteration = 0; iteration < 3; iteration += 1) await engine.runOnce()
      expect(maximumActive).toBeLessThanOrEqual(2)
      expect(
        database.connection.db
          .select()
          .from(jobTable)
          .all()
          .every((job) => job.status === "succeeded"),
      ).toBe(true)
    } finally {
      databaseClose(secondConnection.data)
      await databaseDestroy(database.databasePath, database.connection)
    }
  })

  test("moves permanent handler failures directly to the dead state", async () => {
    const database = await databaseCreate()
    try {
      const workflow = workflowCreate("workflow-permanent-handler", database.projectId)
      const job = jobCreate("job-permanent-handler", workflow.id, "permanent-handler-key", 5)
      resultDataRead(workflowRepositoryEnqueue(database.connection.db, { workflow, jobs: [job] }))
      const registry = jobHandlerRegistryCreate()
      expect(
        registry.register("verify_original", () => ({
          success: false,
          op: "verifyOriginal",
          errorMessage: "The original object is invalid",
          retryable: false,
        })).success,
      ).toBe(true)
      const engine = workflowEngineCreate({
        db: database.connection.db,
        workerId: "permanent-handler-worker",
        handlerRegistry: registry,
        clock: () => new Date(now),
      })
      expect((await engine.runOnce()).success).toBe(true)
      expect(database.connection.db.select().from(jobTable).where(eq(jobTable.id, job.id)).get()?.status).toBe("dead")
    } finally {
      await databaseDestroy(database.databasePath, database.connection)
    }
  })

  test("keeps media and cleanup resource limits independent", () => {
    const pool = workflowResourcePoolCreate({ image: 1, video: 1, font: 1, document: 1, rclone: 1, cleanup: 1 })
    expect(pool.acquire("image")).toBe(true)
    expect(pool.acquire("image")).toBe(false)
    expect(pool.acquire("video")).toBe(true)
    expect(pool.acquire("font")).toBe(true)
    expect(pool.acquire("document")).toBe(true)
    expect(pool.acquire("document")).toBe(false)
    expect(pool.acquire("rclone")).toBe(true)
    expect(pool.acquire("cleanup")).toBe(true)
    pool.release("image")
    expect(pool.acquire("image")).toBe(true)
  })
})
