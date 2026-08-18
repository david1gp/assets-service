import type { DoctorCheckAdapters } from "./doctorCheckAdapters.js"
import type { DoctorReport } from "./doctorReportSchema.js"
import type { DoctorRunner } from "./doctorRunner.js"
import { doctorRunnerRun } from "./doctorRunnerRun.js"

export const doctorRunnerCreate = (adapters: DoctorCheckAdapters): DoctorRunner => ({
  run: (): Promise<DoctorReport> => doctorRunnerRun(adapters),
})
