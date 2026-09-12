import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"

export const r2BucketCredentialSchema = v.strictObject({
  bucket: v.pipe(v.string(), v.minLength(1)),
  accessKeyId: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  secretAccessKey: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  revocationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export type R2BucketCredential = v.InferOutput<typeof r2BucketCredentialSchema>
