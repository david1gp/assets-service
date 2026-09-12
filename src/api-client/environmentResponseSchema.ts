import * as v from "valibot"

import { environmentSchema } from "../project/environmentSchema.js"
import { r2PrefixSchema } from "../project/r2PrefixSchema.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"

const environmentStorageResponseSchema = v.strictObject({
  name: environmentNameSchema,
  r2Bucket: environmentSchema.entries.r2Bucket,
  r2Prefix: r2PrefixSchema,
  publicBaseUrl: environmentSchema.entries.publicBaseUrl,
})

const environmentNameResponseSchema = v.strictObject({ name: environmentNameSchema })

/**
 * Accepts the canonical service environment and the reduced settings shape
 * returned by Assets Service 0.6.1 project registrations.
 *
 * The reduced forms are intentionally limited to the two historical response
 * projections; writes and repository data continue to use environmentSchema.
 */
export const environmentResponseSchema = v.union([
  environmentSchema,
  environmentStorageResponseSchema,
  environmentNameResponseSchema,
])

export type EnvironmentResponse = v.InferOutput<typeof environmentResponseSchema>
