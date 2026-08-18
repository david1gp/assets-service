import type { SourceRevisionDeletionEligibilityResponse } from "../api-client/sourceRevisionDeletionEligibilityResponseSchema.js"
import type { Result } from "../schemas/resultSchema.js"

export type SourceRevisionDeletionEligibilityRepository = {
  sourceRevisionDeletionEligibilityRead: (
    projectId: string,
    environment: string,
    sourceRevisionId: string,
  ) => Result<SourceRevisionDeletionEligibilityResponse>
}
