import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"
import { doctorReportRedact } from "./doctorReportRedact.js"
import type { DoctorReport } from "./doctorReportSchema.js"

export const doctorReportStringify = (report: DoctorReport): string =>
  `${canonicalJsonStringify(doctorReportRedact(report))}\n`
