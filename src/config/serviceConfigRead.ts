import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type ServiceConfig, serviceConfigSchema } from "./serviceConfigSchema.js"

export const serviceConfigRead = (environment: NodeJS.ProcessEnv = process.env): Result<ServiceConfig> => {
  const environmentName = environment.ASSETS_ENVIRONMENT
  const parsed = v.safeParse(serviceConfigSchema, {
    environment: environmentName,
    apiHost: environment.ASSETS_API_HOST,
    apiPort: Number(environment.ASSETS_API_PORT),
    databasePath: environment.ASSETS_DATABASE_PATH,
    r2AccountId: environment.CLOUDFLARE_ACCOUNT_ID,
    r2AccessKeyId: environment.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    r2Bucket: environment.ASSETS_R2_BUCKET,
    ...(environment.ASSETS_R2_PRIVATE_BUCKET ? { r2PrivateBucket: environment.ASSETS_R2_PRIVATE_BUCKET } : {}),
    ...(environment.ASSETS_R2_PUBLIC_BUCKET ? { r2PublicBucket: environment.ASSETS_R2_PUBLIC_BUCKET } : {}),
    r2Endpoint: environment.ASSETS_R2_ENDPOINT,
    r2PublicBaseUrl: environment.ASSETS_R2_PUBLIC_BASE_URL,
    ...(environment.ASSETS_R2_CUSTOM_DOMAIN_PROBE_KEY
      ? { r2CustomDomainProbeKey: environment.ASSETS_R2_CUSTOM_DOMAIN_PROBE_KEY }
      : {}),
    workerId: environment.ASSETS_WORKER_ID,
    rcloneExecutable: environment.ASSETS_RCLONE_EXECUTABLE ?? "rclone",
    rcloneRemote: environment.ASSETS_RCLONE_REMOTE ?? "gdrive_beta",
    rcloneBackupRoot: environment.ASSETS_RCLONE_BACKUP_ROOT ?? "backups",
    rcloneTimeoutMs: Number(environment.ASSETS_RCLONE_TIMEOUT_MS ?? "300000"),
    ffprobeExecutable: environment.ASSETS_FFPROBE_EXECUTABLE ?? "ffprobe",
    ...(environment.ASSETS_LEGACY_IMPORT_ROOTS === undefined
      ? {}
      : {
          legacyImportRoots: environment.ASSETS_LEGACY_IMPORT_ROOTS.split(",")
            .map((root) => root.trim())
            .filter((root) => root.length > 0),
        }),
  })

  if (!parsed.success) return resultErrorCreate("serviceConfigRead", v.summarize(parsed.issues))
  return { success: true, data: parsed.output }
}
