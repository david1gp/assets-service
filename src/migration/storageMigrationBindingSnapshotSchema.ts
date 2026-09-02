import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { r2PrefixSchema } from "../project/r2PrefixSchema.js"

export const storageMigrationBindingSnapshotSchema = v.strictObject({
  projectId: idSchema,
  environmentId: idSchema,
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  prefix: v.optional(r2PrefixSchema, ""),
  publicBaseUrl: v.pipe(v.string(), v.url()),
})

export type StorageMigrationBindingSnapshot = v.InferOutput<typeof storageMigrationBindingSnapshotSchema>
