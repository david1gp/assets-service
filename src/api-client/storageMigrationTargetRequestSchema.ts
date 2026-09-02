import * as v from "valibot"

import { r2PrefixSchema } from "../project/r2PrefixSchema.js"

export const storageMigrationTargetRequestSchema = v.strictObject({
  r2Bucket: v.optional(v.pipe(v.string(), v.minLength(1))),
  r2Prefix: v.optional(r2PrefixSchema),
  publicBaseUrl: v.optional(v.pipe(v.string(), v.url())),
})

export type StorageMigrationTargetRequest = v.InferOutput<typeof storageMigrationTargetRequestSchema>
