import * as v from "valibot"

import { zitadelDoctorCheckSchema } from "./zitadelDoctorCheckSchema.js"

export const zitadelDoctorReportSchema = v.strictObject({
  healthy: v.boolean(),
  checks: v.pipe(v.array(zitadelDoctorCheckSchema), v.minLength(3)),
})

export type ZitadelDoctorReport = v.InferOutput<typeof zitadelDoctorReportSchema>
