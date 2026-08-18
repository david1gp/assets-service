import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const catalogGenerationSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  environment: v.picklist(["development", "production"]),
  digest: sha256Schema,
  manifestObjectKey: v.pipe(v.string(), v.minLength(1)),
  createdAt: isoDateSchema,
})

export type CatalogGeneration = v.InferOutput<typeof catalogGenerationSchema>
