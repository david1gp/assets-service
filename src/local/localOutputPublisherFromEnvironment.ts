import * as v from "valibot"

import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import { environmentNameSchema } from "../schemas/environmentNameSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { storageBindingSchema, type StorageBinding } from "../storage/storageBindingSchema.js"
import type { LocalOutputPublisher } from "./localOutputPublisher.js"
import { localOutputPublisherCreate } from "./localOutputPublisherCreate.js"

export const localOutputPublisherFromEnvironment = (options: {
  env: NodeJS.ProcessEnv
  fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): Result<LocalOutputPublisher | null> => {
  const values = [
    options.env.CLOUDFLARE_ACCOUNT_ID,
    options.env.R2_ACCESS_KEY_ID,
    options.env.R2_SECRET_ACCESS_KEY,
    options.env.ASSETS_R2_ENDPOINT,
    options.env.ASSETS_R2_BUCKET,
  ]
  const configured = values.some((value) => value !== undefined)
  if (!configured) return { success: true, data: null }
  if (values.some((value) => value === undefined || value.length === 0))
    return resultErrorCreate(
      "localOutputPublisherConfig",
      "Local R2 publication requires CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ASSETS_R2_ENDPOINT, and an R2 bucket",
    )

  const environment = v.safeParse(environmentNameSchema, options.env.ASSETS_ENVIRONMENT ?? "development")
  if (!environment.success) return resultErrorCreate("localOutputPublisherConfig", "ASSETS_ENVIRONMENT was invalid")
  const endpoint = options.env.ASSETS_R2_ENDPOINT
  const bucket = options.env.ASSETS_R2_BUCKET
  const publicBaseUrl = options.env.ASSETS_R2_PUBLIC_BASE_URL ?? "https://assets.invalid"
  const bindingValue: StorageBinding = {
    projectId: options.env.ASSETS_PROJECT ?? "assets-local",
    environment: environment.output,
    bucket: bucket as string,
    prefix: options.env.ASSETS_R2_PREFIX ?? "assets-local",
    publicBaseUrl,
  }
  const binding = v.safeParse(storageBindingSchema, bindingValue)
  if (!binding.success) return resultErrorCreate("localOutputPublisherConfig", v.summarize(binding.issues))

  const adapter = r2StorageAdapterCreate({
    accountId: options.env.CLOUDFLARE_ACCOUNT_ID as string,
    accessKeyId: options.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: options.env.R2_SECRET_ACCESS_KEY as string,
    endpoint: endpoint as string,
    fetchImplementation: options.fetcher,
  })
  return { success: true, data: localOutputPublisherCreate({ adapter, binding: binding.output }) }
}
