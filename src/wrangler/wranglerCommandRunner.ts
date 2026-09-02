import type { Result } from "../schemas/resultSchema.js"

export type WranglerCommandRunner = (request: {
  args: readonly string[]
}) => Promise<Result<{ exitCode: number; stdout: string; stderr: string }>>
