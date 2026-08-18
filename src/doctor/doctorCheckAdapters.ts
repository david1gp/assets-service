import type { DoctorCheckAdapter } from "./doctorCheckAdapter.js"
import type { DoctorCheckName } from "./doctorCheckNameSchema.js"

export type DoctorCheckAdapters = Partial<Record<DoctorCheckName, DoctorCheckAdapter>>
