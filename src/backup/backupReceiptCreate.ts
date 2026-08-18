import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type BackupReceipt, backupReceiptSchema } from "./backupReceiptSchema.js"
import type { RcloneBackupResult } from "./rcloneBackupResultSchema.js"

export const backupReceiptCreate = (input: {
  id: string
  projectId: string
  sourceRevisionId: string
  jobId: string
  result: RcloneBackupResult
}): Result<BackupReceipt> => {
  const op = "backupReceiptCreate"
  const parsed = v.safeParse(backupReceiptSchema, {
    id: input.id,
    projectId: input.projectId,
    sourceRevisionId: input.sourceRevisionId,
    jobId: input.jobId,
    remotePath: input.result.remotePath,
    byteSize: input.result.byteSize,
    sha256: input.result.sha256,
    checkResult: input.result.checkResult,
    completedAt: input.result.completedAt,
  })
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)
  return { success: true, data: parsed.output }
}
