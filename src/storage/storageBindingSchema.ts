import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"

export const storageBindingSchema = v.strictObject({
  projectId: v.pipe(v.string(), v.minLength(1)),
  environment: environmentNameSchema,
  bucket: v.pipe(v.string(), v.minLength(1)),
  prefix: v.pipe(v.string(), v.minLength(1)),
  publicBaseUrl: v.pipe(v.string(), v.url()),
})

export type StorageBinding = v.InferOutput<typeof storageBindingSchema>
