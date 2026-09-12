import * as v from "valibot"

import { r2PrefixSchema } from "../project/r2PrefixSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { r2CustomDomainSchema } from "../storage/r2CustomDomainSchema.js"

export const storageMigrationBindingSnapshotSchema = v.pipe(
  v.strictObject({
    projectId: idSchema,
    environmentId: idSchema,
    environment: environmentNameSchema,
    bucket: v.pipe(v.string(), v.minLength(1)),
    prefix: v.optional(r2PrefixSchema, ""),
    publicBaseUrl: v.pipe(v.string(), v.url()),
    customDomain: v.optional(r2CustomDomainSchema),
    zoneId: v.optional(idSchema),
  }),
  v.check(
    (input) => (input.customDomain === undefined) === (input.zoneId === undefined),
    "Custom domain metadata requires both hostname and zone ID",
  ),
)

export type StorageMigrationBindingSnapshot = v.InferOutput<typeof storageMigrationBindingSnapshotSchema>
