import type { DoctorCheckReport } from "./doctorCheckReportSchema.js"
import type { DoctorReport } from "./doctorReportSchema.js"
import { doctorValueRedact } from "./doctorValueRedact.js"

export const doctorReportRedact = (report: DoctorReport): DoctorReport => ({
  status: report.status,
  checks: report.checks.map(
    (check): DoctorCheckReport => ({
      name: check.name,
      status: check.status,
      message: doctorValueRedact(check.message) as string,
      ...(check.details === undefined ? {} : { details: doctorValueRedact(check.details) }),
    }),
  ),
})
