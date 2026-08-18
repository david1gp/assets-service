import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { JobHandler } from "./jobHandler.js"
import type { JobKind } from "./jobKindSchema.js"

export const jobHandlerRegistryCreate = () => {
  const handlers = new Map<JobKind, JobHandler>()

  return {
    register: (kind: JobKind, handler: JobHandler): Result<null> => {
      if (handlers.has(kind))
        return resultErrorCreate("jobHandlerRegistryCreate", `Handler already registered: ${kind}`)
      handlers.set(kind, handler)
      return { success: true, data: null }
    },
    resolve: (kind: JobKind): JobHandler | undefined => handlers.get(kind),
    registeredKinds: (): JobKind[] => [...handlers.keys()],
  }
}
