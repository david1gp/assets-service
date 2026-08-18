import * as v from "valibot"

export const doctorCheckStatusSchema = v.picklist(["pass", "fail"])

export type DoctorCheckStatus = v.InferOutput<typeof doctorCheckStatusSchema>
