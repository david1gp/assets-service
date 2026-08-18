export type RcloneCommandRequest = {
  executable: string
  args: string[]
  timeoutMs: number
  signal?: AbortSignal
}
