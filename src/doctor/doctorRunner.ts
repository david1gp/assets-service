import type { DoctorReport } from "./doctorReportSchema.js"

export type DoctorRunner = {
  run: () => Promise<DoctorReport>
}
