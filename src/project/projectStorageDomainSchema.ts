import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { r2CustomDomainSchema } from "../storage/r2CustomDomainSchema.js"

export const projectStorageDomainSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  customDomain: r2CustomDomainSchema,
  zoneId: idSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type ProjectStorageDomain = v.InferOutput<typeof projectStorageDomainSchema>
