import * as v from "valibot"

export const jobKindSchema = v.picklist([
  "verify_original",
  "backup_original",
  "plan_outputs",
  "process_image_output",
  "copy_video_output",
  "process_font_output",
  "process_document_output",
  "publish_asset",
  "notify_customer_upload",
  "cleanup_local_files",
  "delete_asset",
])

export type JobKind = v.InferOutput<typeof jobKindSchema>
