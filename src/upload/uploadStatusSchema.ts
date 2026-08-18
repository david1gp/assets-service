import * as v from "valibot"

export const uploadStatusSchema = v.picklist(["pending", "verified", "accepted", "failed", "cancelled"])

export type UploadStatus = v.InferOutput<typeof uploadStatusSchema>
