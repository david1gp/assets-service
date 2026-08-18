import type { DoctorCheckResult } from "./doctorCheckResult.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const ffprobeDoctorCheckCreate =
  (executable: string, run: (executable: string) => Promise<Result<{ exitCode: number }>> = ffprobeCommandRun) =>
  async (): Promise<Result<DoctorCheckResult>> => {
    const result = await run(executable)
    if (!result.success) return result
    if (result.data.exitCode !== 0)
      return resultErrorCreate("ffprobeDoctorCheckCreate", "ffprobe did not run successfully")
    return { success: true, data: { message: "ffprobe is available" } }
  }

async function ffprobeCommandRun(executable: string): Promise<Result<{ exitCode: number }>> {
  try {
    const process = Bun.spawn([executable, "-version"], { stdout: "ignore", stderr: "ignore" })
    return { success: true, data: { exitCode: await process.exited } }
  } catch (error) {
    return resultErrorCreate("ffprobeCommandRun", "ffprobe could not be started", error)
  }
}
