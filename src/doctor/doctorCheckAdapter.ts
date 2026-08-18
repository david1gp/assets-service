import type { Result } from "../schemas/resultSchema.js"
import type { DoctorCheckResult } from "./doctorCheckResult.js"

export type DoctorCheckAdapter = () => Result<DoctorCheckResult> | Promise<Result<DoctorCheckResult>>
