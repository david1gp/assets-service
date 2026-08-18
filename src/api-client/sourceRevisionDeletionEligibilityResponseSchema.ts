import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

const sourceRevisionDeletionEligibilityChecksSchema = v.strictObject({
  sourceIdentity: v.boolean(),
  verifiedBackup: v.boolean(),
  successfulWorkflow: v.boolean(),
  lineageMatchingCurrentOutputs: v.boolean(),
  currentCatalogInclusion: v.boolean(),
})

export const sourceRevisionDeletionEligibilityResponseSchema = v.strictObject({
  sourceRevisionId: idSchema,
  eligible: v.boolean(),
  checks: sourceRevisionDeletionEligibilityChecksSchema,
})

export type SourceRevisionDeletionEligibilityResponse = v.InferOutput<
  typeof sourceRevisionDeletionEligibilityResponseSchema
>
