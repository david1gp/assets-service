import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { r2PrefixSchema } from "./r2PrefixSchema.js"

export const projectStorageLocationSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  prefix: v.optional(r2PrefixSchema, ""),
  createdAt: isoDateSchema,
})

export type ProjectStorageLocation = v.InferOutput<typeof projectStorageLocationSchema>
