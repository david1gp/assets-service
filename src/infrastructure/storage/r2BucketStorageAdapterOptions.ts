import type { R2BucketCredentialRepository } from "../../r2/r2BucketCredentialRepository.js"

export type R2BucketStorageAdapterOptions = {
  accountId: string
  endpoint: string
  credentialRepository: R2BucketCredentialRepository
  bootstrapCredential?: {
    accessKeyId: string
    secretAccessKey: string
  }
  fetchImplementation?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  now?: () => Date
  timeoutMs?: number
}
