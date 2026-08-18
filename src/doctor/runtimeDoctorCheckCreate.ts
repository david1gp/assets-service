import type { DoctorCheckResult } from "./doctorCheckResult.js"
import type { Result } from "../schemas/resultSchema.js"

export const runtimeDoctorCheckCreate = (): (() => Result<DoctorCheckResult>) => () => ({
  success: true,
  data: { details: { runtime: "bun", version: Bun.version } },
})
