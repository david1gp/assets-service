import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { SqliteOnlineBackupAdapter } from "./sqliteOnlineBackupAdapter.js"

type SqliteOnlineBackupAdapterProductionOptions = {
  executable?: string
  timeoutMs?: number
}

export const sqliteOnlineBackupAdapterProduction = (
  options: SqliteOnlineBackupAdapterProductionOptions = {},
): SqliteOnlineBackupAdapter => {
  const executable = options.executable ?? "sqlite3"
  const timeoutMs = options.timeoutMs ?? 300_000

  return async (input): Promise<Result<null>> => {
    const op = "sqliteOnlineBackupAdapterProduction"
    if (input.databasePath.length === 0 || input.snapshotPath.length === 0)
      return resultErrorCreate(op, "SQLite database and snapshot paths are required")
    if (input.databasePath === input.snapshotPath)
      return resultErrorCreate(op, "SQLite snapshot path must differ from the database path")
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) return resultErrorCreate(op, "SQLite backup timeout is invalid")
    if (input.signal?.aborted) return resultErrorCreate(op, "SQLite backup was cancelled")

    let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined
    let timedOut = false
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      child = Bun.spawn([executable, input.databasePath, `.backup '${sqlitePathEscape(input.snapshotPath)}'`], {
        stdout: "pipe",
        stderr: "pipe",
      })
      abort = () => {
        cancelled = true
        child?.kill()
      }
      input.signal?.addEventListener("abort", abort, { once: true })
      timeout = setTimeout(() => {
        timedOut = true
        child?.kill()
      }, timeoutMs)
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      if (timedOut) return resultErrorCreate(op, "SQLite online backup timed out")
      if (cancelled || input.signal?.aborted) return resultErrorCreate(op, "SQLite backup was cancelled")
      if (exitCode !== 0)
        return resultErrorCreate(op, "SQLite online backup failed", {
          exitCode,
          stdout: stdout.trim().slice(0, 512),
          stderr: stderr.trim().slice(0, 512),
        })
      return { success: true, data: null }
    } catch (error) {
      if (timedOut) return resultErrorCreate(op, "SQLite online backup timed out")
      if (cancelled || input.signal?.aborted) return resultErrorCreate(op, "SQLite backup was cancelled")
      return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
    } finally {
      if (abort !== undefined) input.signal?.removeEventListener("abort", abort)
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
}

function sqlitePathEscape(path: string): string {
  return path.replaceAll("'", "''")
}
