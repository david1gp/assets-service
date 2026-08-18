import type { DeletionRequestResponse } from "../api-client/deletionRequestResponseSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { DeletionState } from "./deletionStateSchema.js"

export type DeletionApiRepository = {
  deletionRequestEnqueue: (projectId: string, assetId: string, actorId?: string) => Result<DeletionRequestResponse>
  deletionStateRead?: (projectId: string, assetId: string) => Result<DeletionState | null>
}
