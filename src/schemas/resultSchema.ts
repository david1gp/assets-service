export type Result<T> =
  | { success: true; data: T }
  | {
      success: false
      op: string
      errorMessage: string
      rawData?: unknown
      diagnostics?: unknown
      retryable?: boolean
    }
