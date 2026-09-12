import * as v from "valibot"

const bucketListSchema = v.array(v.pipe(v.string(), v.minLength(1)))

export const r2BucketCredentialRepairResultSchema = v.strictObject({
  discoveredBuckets: bucketListSchema,
  repairedBuckets: bucketListSchema,
  skippedBuckets: bucketListSchema,
  verifiedBuckets: bucketListSchema,
  revokedBuckets: bucketListSchema,
})

export type R2BucketCredentialRepairResult = v.InferOutput<typeof r2BucketCredentialRepairResultSchema>
