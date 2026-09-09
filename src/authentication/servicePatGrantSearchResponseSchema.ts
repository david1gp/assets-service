import * as v from "valibot"

import { zitadelUserGrantSchema } from "../infrastructure/zitadel/zitadelUserGrantSchema.js"

export const servicePatGrantSearchResponseSchema = v.object({
  result: v.optional(v.array(zitadelUserGrantSchema)),
})

export type ServicePatGrantSearchResponse = v.InferOutput<typeof servicePatGrantSearchResponseSchema>
