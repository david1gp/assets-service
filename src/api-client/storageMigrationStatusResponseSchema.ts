import * as v from "valibot"

import { storageMigrationSchema } from "../migration/storageMigrationSchema.js"

export const storageMigrationStatusResponseSchema = storageMigrationSchema

export type StorageMigrationStatusResponse = v.InferOutput<typeof storageMigrationStatusResponseSchema>
