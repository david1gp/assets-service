import * as v from "valibot"

export const r2BucketCredentialRepairRequestSchema = v.strictObject({
  accountId: v.pipe(v.string(), v.minLength(1)),
  apiToken: v.pipe(v.string(), v.minLength(1)),
})

export type R2BucketCredentialRepairRequest = v.InferOutput<typeof r2BucketCredentialRepairRequestSchema>
