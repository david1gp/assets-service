import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const organizationSchema = v.strictObject({
  id: idSchema,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(v.string(), v.slug()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type Organization = v.InferOutput<typeof organizationSchema>
