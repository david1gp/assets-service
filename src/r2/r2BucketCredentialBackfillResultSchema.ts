import * as v from "valibot"

export const r2BucketCredentialBackfillResultSchema = v.strictObject({
  dryRun: v.boolean(),
  discoveredBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
  plannedBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
  createdBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
  skippedBuckets: v.array(v.pipe(v.string(), v.minLength(1))),
})

export type R2BucketCredentialBackfillResult = v.InferOutput<typeof r2BucketCredentialBackfillResultSchema>
