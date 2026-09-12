import * as v from "valibot"

import { r2BucketCredentialSchema } from "./r2BucketCredentialSchema.js"

export const r2BucketCredentialRepairPendingSchema = v.strictObject({
  bucket: v.pipe(v.string(), v.minLength(1)),
  previousCredential: r2BucketCredentialSchema,
  replacementRevocationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

export type R2BucketCredentialRepairPending = v.InferOutput<typeof r2BucketCredentialRepairPendingSchema>
