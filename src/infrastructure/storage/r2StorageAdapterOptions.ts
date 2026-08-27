export type R2StorageAdapterOptions = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  now?: () => Date
  timeoutMs?: number
}
