import * as v from "valibot"

import { r2BucketCredentialCreateInputSchema } from "../r2/r2BucketCredentialCreateInputSchema.js"

export const r2BucketCredentialRegisterRequestSchema = r2BucketCredentialCreateInputSchema

export type R2BucketCredentialRegisterRequest = v.InferOutput<typeof r2BucketCredentialRegisterRequestSchema>
