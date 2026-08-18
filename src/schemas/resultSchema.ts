export type Result<T> =
  | { success: true; data: T }
  | { success: false; op: string; errorMessage: string; rawData?: unknown; retryable?: boolean }
