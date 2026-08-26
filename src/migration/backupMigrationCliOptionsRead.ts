import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type BackupMigrationCliOptions = {
  execute: boolean
  runId?: string
}

export const backupMigrationCliOptionsRead = (args: readonly string[]): Result<BackupMigrationCliOptions> => {
  const op = "backupMigrationCliOptionsRead"
  let dryRun = false
  let execute = false
  let runId: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) continue
    if (argument === "--dry-run") {
      dryRun = true
      continue
    }
    if (argument === "--execute" || argument === "--apply") {
      execute = true
      continue
    }
    if (argument === "--resume") {
      const next = args[index + 1]
      if (next === undefined || next.startsWith("--")) return resultErrorCreate(op, "--resume requires a run id")
      if (runId !== undefined) return resultErrorCreate(op, "--resume may only be specified once")
      runId = next
      index += 1
      continue
    }
    if (argument.startsWith("--resume=")) {
      const value = argument.slice("--resume=".length)
      if (value.length === 0) return resultErrorCreate(op, "--resume requires a run id")
      if (runId !== undefined) return resultErrorCreate(op, "--resume may only be specified once")
      runId = value
      continue
    }
    return resultErrorCreate(op, `Unknown option: ${argument}`)
  }

  if (dryRun && execute) return resultErrorCreate(op, "--dry-run cannot be combined with --execute")
  if (runId !== undefined && !execute) return resultErrorCreate(op, "--resume requires --execute")
  return { success: true, data: { execute, ...(runId === undefined ? {} : { runId }) } }
}
