import type { Result } from "../schemas/resultSchema.js"
import type { Job } from "./jobSchema.js"

export type JobHandler = (
  job: Job,
  context: {
    workerId: string
    signal: AbortSignal
    heartbeat: () => Result<Job>
    isCancelled: () => boolean
  },
) => Result<unknown> | Promise<Result<unknown>>
