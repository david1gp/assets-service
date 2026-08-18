import * as v from "valibot"

export const aiProvenanceSchema = v.nullable(v.picklist(["generated", "enhanced"]))

export type AiProvenance = v.InferOutput<typeof aiProvenanceSchema>
