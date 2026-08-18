import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const projectBindingSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  organizationId: idSchema,
  zitadelProjectId: idSchema,
  serviceProjectId: idSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type ProjectBinding = v.InferOutput<typeof projectBindingSchema>
