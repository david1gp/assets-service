import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { r2PrefixSchema } from "./r2PrefixSchema.js"

export const projectStorageLocationCreateInputSchema = v.strictObject({
  projectId: idSchema,
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  prefix: v.optional(r2PrefixSchema, ""),
})

export type ProjectStorageLocationCreateInput = v.InferOutput<typeof projectStorageLocationCreateInputSchema>
