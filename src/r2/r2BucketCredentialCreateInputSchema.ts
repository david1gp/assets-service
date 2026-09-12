import * as v from "valibot"

export const r2BucketCredentialCreateInputSchema = v.strictObject({
  bucket: v.pipe(v.string(), v.minLength(1)),
  accessKeyId: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  secretAccessKey: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
  revocationId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
})

export type R2BucketCredentialCreateInput = v.InferOutput<typeof r2BucketCredentialCreateInputSchema>
