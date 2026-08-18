import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const projectSchema = v.strictObject({
  id: idSchema,
  organizationId: idSchema,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(v.string(), v.slug()),
  defaultEnvironment: environmentNameSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Project = v.InferOutput<typeof projectSchema>
