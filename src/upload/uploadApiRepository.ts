import type { Environment } from "../project/environmentSchema.js"
import type { Result } from "../schemas/resultSchema.js"
import type { UploadCompletionRequest } from "../api-client/uploadCompletionRequestSchema.js"
import type { UploadCompletionResponse } from "../api-client/uploadCompletionResponseSchema.js"
import type { UploadIntentRequest } from "../api-client/uploadIntentRequestSchema.js"
import type { UploadIntentResponse } from "../api-client/uploadIntentResponseSchema.js"
import type { Upload } from "./uploadSchema.js"

export type UploadApiRepository = {
  uploadIntentCreate: (
    projectId: string,
    environment: Environment,
    input: UploadIntentRequest,
    uploaderId?: string,
  ) => Promise<Result<UploadIntentResponse>>
  uploadCompletionComplete: (
    projectId: string,
    uploadId: string,
    input: UploadCompletionRequest,
  ) => Promise<Result<UploadCompletionResponse>>
  uploadsRead?: (
    projectId: string,
    options: { cursor?: number; limit?: number; status?: Upload["status"]; assetId?: string },
  ) => Result<{
    items: readonly Upload[]
    nextCursor: number | null
  }>
  uploadRead?: (projectId: string, uploadId: string) => Result<Upload | null>
}
