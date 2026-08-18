import * as v from "valibot"

export const rcloneDoctorResultSchema = v.strictObject({
  executable: v.literal("ok"),
  remote: v.literal("gdrive_beta"),
  credentials: v.literal("ok"),
  backupRoot: v.literal("ok"),
})

export type RcloneDoctorResult = v.InferOutput<typeof rcloneDoctorResultSchema>
