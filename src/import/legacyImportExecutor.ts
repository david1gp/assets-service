import type { LegacyImportRequest } from "../api-client/legacyImportRequestSchema.js"
import type { LegacyImportStatus } from "./legacyImportStatusSchema.js"
import type { Result } from "../schemas/resultSchema.js"

type LegacyImportPage = { items: readonly LegacyImportStatus[]; nextCursor: number | null }

export type LegacyImportExecutor = {
  legacyImportRequestCreate: (
    projectId: string,
    actorId: string,
    input: LegacyImportRequest,
  ) => Promise<Result<LegacyImportStatus>> | Result<LegacyImportStatus>
  legacyImportStatusRead: (
    projectId: string,
    importId: string,
  ) => Promise<Result<LegacyImportStatus | null>> | Result<LegacyImportStatus | null>
  legacyImportsRead?: (
    projectId: string,
    options: { cursor?: number; limit?: number; status?: LegacyImportStatus["status"] },
  ) => Promise<Result<LegacyImportPage>> | Result<LegacyImportPage>
}
