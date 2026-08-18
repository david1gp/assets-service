import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"
import { sha256Schema } from "../schemas/sha256Schema.js"

export const manifestSchema = v.strictObject({
  id: idSchema,
  projectId: idSchema,
  assetId: v.nullable(idSchema),
  catalogGenerationId: v.nullable(idSchema),
  kind: v.picklist(["asset", "catalog", "deletion"]),
  schema: v.pipe(v.string(), v.minLength(1)),
  objectKey: v.pipe(v.string(), v.minLength(1)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sha256: sha256Schema,
  createdAt: isoDateSchema,
})

export type Manifest = v.InferOutput<typeof manifestSchema>
