import * as v from "valibot"

import { backupStatusSchema } from "../backup/backupStatusSchema.js"

export const backupStatusResponseSchema = backupStatusSchema

export type BackupStatusResponse = v.InferOutput<typeof backupStatusResponseSchema>
