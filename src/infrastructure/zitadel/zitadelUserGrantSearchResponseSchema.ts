import * as v from "valibot"

import { zitadelUserGrantSchema } from "./zitadelUserGrantSchema.js"

export const zitadelUserGrantSearchResponseSchema = v.object({
  details: v.optional(
    v.object({
      totalResult: v.optional(v.union([v.string(), v.number()])),
    }),
  ),
  result: v.optional(v.array(zitadelUserGrantSchema)),
})

export type ZitadelUserGrantSearchResponse = v.InferOutput<typeof zitadelUserGrantSearchResponseSchema>
