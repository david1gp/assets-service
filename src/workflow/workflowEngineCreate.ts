import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobHandler } from "./jobHandler.js"
import { jobRepositoryClaim } from "./jobRepositoryClaim.js"
import { jobRepositoryComplete } from "./jobRepositoryComplete.js"
import { jobRepositoryFail } from "./jobRepositoryFail.js"
import { jobRepositoryHeartbeat } from "./jobRepositoryHeartbeat.js"
import { jobRepositoryRecoverExpiredLeases } from "./jobRepositoryRecoverExpiredLeases.js"
import type { Job } from "./jobSchema.js"
import { workflowResourcePoolCreate } from "./workflowResourcePoolCreate.js"

type JobHandlerRegistry = {
  resolve: (kind: Job["kind"]) => JobHandler | undefined
  registeredKinds: () => Job["kind"][]
}

type WorkflowEngineCreateInput = {
  db: AssetDatabase
  workerId: string
  handlerRegistry: JobHandlerRegistry
  concurrency?: number
  leaseMs?: number
  heartbeatMs?: number
  pollMs?: number
  retryBackoffMs?: (attempt: number) => number
  clock?: () => Date
  resourceLimits?: Partial<Record<WorkflowResource, number>>
  resourcePoolLimits?: Partial<Record<WorkflowResource, number>>
}

type WorkflowResource = "image" | "video" | "font" | "rclone" | "cleanup"

const sleep = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      resolve()
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

const errorMessageRead = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const workflowEngineCreate = (input: WorkflowEngineCreateInput) => {
  const concurrency = Number.isInteger(input.concurrency) && (input.concurrency ?? 0) > 0 ? (input.concurrency ?? 1) : 1
  const leaseMs = input.leaseMs ?? 60_000
  const heartbeatMs = input.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3))
  const pollMs = input.pollMs ?? 1_000
  const clock = input.clock ?? (() => new Date())
  const resourcePool = workflowResourcePoolCreate(input.resourceLimits ?? input.resourcePoolLimits)
  const controller = new AbortController()
  let runPromise: Promise<Result<null>> | undefined

  const executeClaimedJob = async (
    job: Job,
    leaseOwner: string,
    resource: WorkflowResource | undefined,
  ): Promise<Result<boolean>> => {
    try {
      return await executeClaimedJobOwned(job, leaseOwner)
    } finally {
      if (resource !== undefined) resourcePool.release(resource)
    }
  }

  const executeClaimedJobOwned = async (job: Job, leaseOwner: string): Promise<Result<boolean>> => {
    const handler = input.handlerRegistry.resolve(job.kind)
    if (handler === undefined) return { success: true, data: false }

    const jobController = new AbortController()
    let heartbeatFailed = false
    const heartbeatLoop = (async () => {
      while (!jobController.signal.aborted) {
        await sleep(heartbeatMs, jobController.signal)
        if (jobController.signal.aborted) return
        const heartbeat = jobRepositoryHeartbeat(input.db, {
          jobId: job.id,
          workerId: leaseOwner,
          now: clock(),
          leaseMs,
        })
        if (!heartbeat.success) {
          heartbeatFailed = true
          jobController.abort()
        }
      }
    })()

    let handlerResult: Result<unknown>
    try {
      handlerResult = await handler(job, {
        workerId: leaseOwner,
        signal: jobController.signal,
        heartbeat: () =>
          jobRepositoryHeartbeat(input.db, { jobId: job.id, workerId: leaseOwner, now: clock(), leaseMs }),
        isCancelled: () => jobController.signal.aborted,
      })
    } catch (error) {
      handlerResult = { success: false, op: "jobHandler", errorMessage: errorMessageRead(error) }
    }

    jobController.abort()
    await heartbeatLoop
    if (handlerResult.success) {
      const completed = jobRepositoryComplete(input.db, { jobId: job.id, workerId: leaseOwner, now: clock() })
      if (!completed.success && (heartbeatFailed || completed.errorMessage === "The job lease is no longer owned")) {
        return { success: true, data: true }
      }
      if (!completed.success) return completed
      return { success: true, data: true }
    }

    const failed = jobRepositoryFail(input.db, {
      jobId: job.id,
      workerId: leaseOwner,
      error: {
        code: "job_failed",
        message: handlerResult.errorMessage,
        retryable: handlerResult.retryable ?? true,
      },
      now: clock(),
      backoffMs: input.retryBackoffMs?.(job.attempts) ?? undefined,
    })
    if (!failed.success && (heartbeatFailed || failed.errorMessage === "The job lease is no longer owned")) {
      return { success: true, data: true }
    }
    if (!failed.success) return failed
    return { success: true, data: true }
  }

  const runOnce = async (): Promise<Result<number>> => {
    const recovered = jobRepositoryRecoverExpiredLeases(input.db, { now: clock() })
    if (!recovered.success) return recovered
    const kinds = input.handlerRegistry.registeredKinds()
    if (kinds.length === 0) return { success: true, data: 0 }

    const executions = await Promise.all(
      Array.from({ length: concurrency }, async (_, index) => {
        const leaseOwner = `${input.workerId}:${index}`
        for (const kind of kinds) {
          const resource = jobResourceRead(kind)
          if (resource !== undefined && !resourcePool.acquire(resource)) continue
          const claimed = jobRepositoryClaim(input.db, { workerId: leaseOwner, now: clock(), leaseMs, kinds: [kind] })
          if (!claimed.success) {
            if (resource !== undefined) resourcePool.release(resource)
            return claimed
          }
          if (claimed.data === null) {
            if (resource !== undefined) resourcePool.release(resource)
            continue
          }
          return executeClaimedJob(claimed.data, leaseOwner, resource)
        }
        return { success: true, data: false } as const
      }),
    )
    const failed = executions.find((execution) => !execution.success)
    if (failed !== undefined && !failed.success) return failed
    return { success: true, data: executions.filter((execution) => execution.success && execution.data).length }
  }

  function jobResourceRead(kind: Job["kind"]): WorkflowResource | undefined {
    if (kind === "process_image_output") return "image"
    if (kind === "copy_video_output") return "video"
    if (kind === "process_font_output") return "font"
    if (kind === "backup_original") return "rclone"
    if (kind === "delete_asset") return "rclone"
    if (kind === "cleanup_local_files") return "cleanup"
    return undefined
  }

  const run = (signal?: AbortSignal): Promise<Result<null>> => {
    if (runPromise !== undefined) return runPromise
    if (signal?.aborted) return Promise.resolve({ success: true, data: null })
    const abortExternal = () => controller.abort()
    signal?.addEventListener("abort", abortExternal, { once: true })
    const started = (async (): Promise<Result<null>> => {
      while (!controller.signal.aborted) {
        const result = await runOnce()
        if (!result.success) return result
        if (result.data === 0) await sleep(pollMs, controller.signal)
      }
      return { success: true, data: null } as const
    })().finally(() => signal?.removeEventListener("abort", abortExternal))
    runPromise = started
    return started
  }

  return {
    run,
    runOnce,
    stop: () => controller.abort(),
  }
}
