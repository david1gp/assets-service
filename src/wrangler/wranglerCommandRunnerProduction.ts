import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"

export const wranglerCommandRunnerProduction: WranglerCommandRunner = async (
  request,
): Promise<
  Result<{
    exitCode: number
    stdout: string
    stderr: string
  }>
> => {
  const op = "wranglerCommandRunnerProduction"
  try {
    const child = Bun.spawn(["wrangler", ...request.args], { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { success: true, data: { exitCode, stdout, stderr } }
  } catch {
    return resultErrorCreate(op, "Wrangler could not be started")
  }
}
