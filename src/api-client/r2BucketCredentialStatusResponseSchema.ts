import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const r2BucketCredentialStatusResponseSchema = v.strictObject({
  projectId: idSchema,
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  registered: v.boolean(),
})

export type R2BucketCredentialStatusResponse = v.InferOutput<typeof r2BucketCredentialStatusResponseSchema>
