import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import { r2CustomDomainSchema } from "../storage/r2CustomDomainSchema.js"

export const projectStorageDomainCreateInputSchema = v.strictObject({
  projectId: idSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  customDomain: r2CustomDomainSchema,
  zoneId: idSchema,
})

export type ProjectStorageDomainCreateInput = v.InferOutput<typeof projectStorageDomainCreateInputSchema>
