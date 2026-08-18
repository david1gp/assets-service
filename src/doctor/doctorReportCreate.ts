import type { DoctorCheckReport } from "./doctorCheckReportSchema.js"
import { doctorReportRedact } from "./doctorReportRedact.js"
import type { DoctorReport } from "./doctorReportSchema.js"

export const doctorReportCreate = (checks: readonly DoctorCheckReport[]): DoctorReport =>
  doctorReportRedact({
    status: checks.some((check) => check.status === "fail") ? "fail" : "pass",
    checks: [...checks],
  })
