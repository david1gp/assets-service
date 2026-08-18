import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const environmentSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  name: environmentNameSchema,
  r2Bucket: v.pipe(v.string(), v.minLength(1)),
  r2Prefix: v.pipe(v.string(), v.minLength(1)),
  publicBaseUrl: v.pipe(v.string(), v.url()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Environment = v.InferOutput<typeof environmentSchema>
