import * as v from "valibot"

import { deletionStateSchema } from "../deletion/deletionStateSchema.js"

/**
 * `null` is a normal answer: most assets were never asked to be deleted. The
 * route answers 200 with `null` instead of 404, so a healthy admin session
 * produces no error traffic while browsing asset detail pages.
 */
export const deletionStatusResponseSchema = v.nullable(deletionStateSchema)

export type DeletionStatusResponse = v.InferOutput<typeof deletionStatusResponseSchema>
