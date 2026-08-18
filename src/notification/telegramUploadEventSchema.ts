import * as v from "valibot"

import { isoDateSchema } from "../schemas/isoDateSchema.js"
import { idSchema } from "../schemas/idSchema.js"

export const telegramUploadEventSchema = v.strictObject({
  eventId: v.pipe(v.string(), v.minLength(1)),
  organizationId: idSchema,
  projectId: idSchema,
  uploaderId: v.pipe(v.string(), v.minLength(1)),
  organizationSlug: v.optional(v.pipe(v.string(), v.minLength(1))),
  projectSlug: v.optional(v.pipe(v.string(), v.minLength(1))),
  originalFilename: v.pipe(v.string(), v.minLength(1)),
  integrationNote: v.pipe(v.string(), v.minLength(1)),
  uploadedAt: isoDateSchema,
  previewUrl: v.optional(v.pipe(v.string(), v.url())),
  assetUrl: v.optional(v.pipe(v.string(), v.url())),
  adminUrl: v.pipe(v.string(), v.url()),
  eventType: v.optional(v.literal("customer_asset_uploaded")),
  uploadId: v.optional(idSchema),
  assetId: v.optional(idSchema),
  sourceRevisionId: v.optional(idSchema),
})

export type TelegramUploadEvent = v.InferOutput<typeof telegramUploadEventSchema>
