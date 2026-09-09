import * as v from "valibot"

export const integrationNoteSetRequestSchema = v.strictObject({
  integrationNote: v.pipe(v.string(), v.maxLength(10000)),
})

export type IntegrationNoteSetRequest = v.InferOutput<typeof integrationNoteSetRequestSchema>
