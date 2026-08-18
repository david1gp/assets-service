import * as v from "valibot"

import { doctorCheckNameSchema } from "./doctorCheckNameSchema.js"
import { doctorCheckStatusSchema } from "./doctorCheckStatusSchema.js"

export const doctorCheckReportSchema = v.strictObject({
  name: doctorCheckNameSchema,
  status: doctorCheckStatusSchema,
  message: v.pipe(v.string(), v.minLength(1)),
  details: v.optional(v.unknown()),
})

export type DoctorCheckReport = v.InferOutput<typeof doctorCheckReportSchema>
