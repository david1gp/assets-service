import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { RcloneErrorCode } from "./rcloneErrorCodeSchema.js"

export const rcloneErrorCreate = (
  op: string,
  code: RcloneErrorCode,
  errorMessage: string,
  rawData?: unknown,
): Result<never> =>
  resultErrorCreate(op, errorMessage, { code, ...(rawData === undefined ? {} : { details: rawData }) })
