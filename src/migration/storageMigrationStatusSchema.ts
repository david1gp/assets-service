import * as v from "valibot"

export const storageMigrationStatusSchema = v.picklist(["queued", "running", "succeeded", "failed", "cancelled"])

export type StorageMigrationStatus = v.InferOutput<typeof storageMigrationStatusSchema>
