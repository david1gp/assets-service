import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { DoctorCheckAdapters } from "./doctorCheckAdapters.js"
import type { DoctorCheckReport } from "./doctorCheckReportSchema.js"
import { doctorChecksCreate } from "./doctorChecksCreate.js"
import { doctorReportCreate } from "./doctorReportCreate.js"
import type { DoctorReport } from "./doctorReportSchema.js"

export const doctorRunnerRun = async (adapters: DoctorCheckAdapters): Promise<DoctorReport> => {
  const reports: DoctorCheckReport[] = []

  for (const check of doctorChecksCreate(adapters)) {
    let result: Awaited<ReturnType<typeof check.run>>
    try {
      result = await check.run()
    } catch (error) {
      result = resultErrorCreate(check.name, error instanceof Error ? error.message : String(error))
    }

    if (result.success) {
      reports.push({
        name: check.name,
        status: "pass",
        message: result.data.message ?? "ok",
        ...(result.data.details === undefined ? {} : { details: result.data.details }),
      })
      continue
    }

    reports.push({
      name: check.name,
      status: "fail",
      message: result.errorMessage,
      ...(result.rawData === undefined ? {} : { details: result.rawData }),
    })
  }

  return doctorReportCreate(reports)
}
