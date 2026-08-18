import { rcloneErrorCreate } from "../../backup/rcloneErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { RcloneCommandOutput } from "./rcloneCommandOutput.js"
import type { RcloneCommandRequest } from "./rcloneCommandRequest.js"

export const rcloneCommandRunnerProduction = async (
  request: RcloneCommandRequest,
): Promise<Result<RcloneCommandOutput>> => {
  const op = "rcloneCommandRunnerProduction"
  if (request.args.some((argument) => argument === "sync" || argument === "bisync")) {
    return rcloneErrorCreate(op, "invalid_request", "rclone sync and bisync are forbidden")
  }
  if (request.timeoutMs < 1 || !Number.isInteger(request.timeoutMs)) {
    return rcloneErrorCreate(op, "invalid_request", "rclone timeout must be a positive integer")
  }
  if (request.signal?.aborted) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")

  let timedOut = false
  let cancelled = false
  let process: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined

  const kill = (reason: "timeout" | "cancelled") => {
    if (reason === "timeout") timedOut = true
    if (reason === "cancelled") cancelled = true
    process?.kill()
  }

  try {
    const child = Bun.spawn([request.executable, ...request.args], { stdout: "pipe", stderr: "pipe" })
    process = child
    abort = () => kill("cancelled")
    request.signal?.addEventListener("abort", abort, { once: true })
    timeout = setTimeout(() => kill("timeout"), request.timeoutMs)

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (timedOut) return rcloneErrorCreate(op, "timeout", "rclone operation timed out")
    if (cancelled) return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
    return { success: true, data: { exitCode, stdout, stderr } }
  } catch {
    if (timedOut) return rcloneErrorCreate(op, "timeout", "rclone operation timed out")
    if (cancelled || request.signal?.aborted)
      return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
    return rcloneErrorCreate(op, "command_unavailable", "unable to start rclone")
  } finally {
    if (abort !== undefined) request.signal?.removeEventListener("abort", abort)
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
