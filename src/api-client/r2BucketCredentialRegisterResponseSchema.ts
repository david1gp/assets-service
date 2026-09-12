import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const r2BucketCredentialRegisterResponseSchema = v.strictObject({
  projectId: idSchema,
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  registered: v.literal(true),
})

export type R2BucketCredentialRegisterResponse = v.InferOutput<typeof r2BucketCredentialRegisterResponseSchema>
