import type { DoctorCheckAdapter } from "./doctorCheckAdapter.js"
import type { DoctorCheckAdapters } from "./doctorCheckAdapters.js"
import type { DoctorCheckName } from "./doctorCheckNameSchema.js"

const doctorCheckNames: readonly DoctorCheckName[] = ["r2", "rclone", "sqlite", "zitadel", "ffprobe", "runtime"]

type DoctorCheck = {
  name: DoctorCheckName
  run: DoctorCheckAdapter
}

export const doctorChecksCreate = (adapters: DoctorCheckAdapters): DoctorCheck[] =>
  doctorCheckNames.flatMap((name) => {
    const run = adapters[name]
    return run === undefined ? [] : [{ name, run }]
  })
