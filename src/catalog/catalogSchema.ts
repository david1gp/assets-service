import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"
import { catalogOutputSchema } from "./catalogOutputSchema.js"

export const catalogSchema = v.strictObject({
  schema: v.pipe(v.string(), v.minLength(1)),
  projectId: idSchema,
  environment: v.picklist(["development", "production"]),
  digest: sha256Schema,
  rendererVersion: v.pipe(v.string(), v.minLength(1)),
  generatedAt: isoDateSchema,
  outputs: v.array(catalogOutputSchema),
})

export type Catalog = v.InferOutput<typeof catalogSchema>
