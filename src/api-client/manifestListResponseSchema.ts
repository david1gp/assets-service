import * as v from "valibot"

import { manifestSchema } from "../catalog/manifestSchema.js"
import { pageInfoSchema } from "./pageInfoSchema.js"

export const manifestListResponseSchema = v.strictObject({
  manifests: v.array(manifestSchema),
  page: pageInfoSchema,
})

export type ManifestListResponse = v.InferOutput<typeof manifestListResponseSchema>
