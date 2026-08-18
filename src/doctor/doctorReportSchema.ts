import * as v from "valibot"

import { doctorCheckReportSchema } from "./doctorCheckReportSchema.js"
import { doctorCheckStatusSchema } from "./doctorCheckStatusSchema.js"

export const doctorReportSchema = v.strictObject({
  status: doctorCheckStatusSchema,
  checks: v.array(doctorCheckReportSchema),
})

export type DoctorReport = v.InferOutput<typeof doctorReportSchema>
