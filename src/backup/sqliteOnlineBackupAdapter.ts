import type { Result } from "../schemas/resultSchema.js"

export type SqliteOnlineBackupAdapter = (input: {
  databasePath: string
  snapshotPath: string
  signal?: AbortSignal
}) => Promise<Result<null>>
