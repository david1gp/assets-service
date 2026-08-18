import * as v from "valibot"

export const doctorCheckNameSchema = v.picklist(["r2", "rclone", "sqlite", "zitadel", "ffprobe", "runtime"])

export type DoctorCheckName = v.InferOutput<typeof doctorCheckNameSchema>
