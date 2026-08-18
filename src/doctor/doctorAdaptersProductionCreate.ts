import type { ZitadelAuthConfig } from "../authentication/zitadelAuthConfigSchema.js"
import type { ServiceConfig } from "../config/serviceConfigSchema.js"
import type { DoctorCheckAdapters } from "./doctorCheckAdapters.js"
import { ffprobeDoctorCheckCreate } from "./ffprobeDoctorCheckCreate.js"
import { rcloneRemoteDoctor } from "../backup/rcloneRemoteDoctor.js"
import { r2DoctorCheckCreate } from "../infrastructure/storage/r2DoctorCheckCreate.js"
import { r2StorageAdapterCreate } from "../infrastructure/storage/r2StorageAdapter.js"
import type { StorageAdapter } from "../storage/storageAdapter.js"
import { sqliteDoctorCheckCreate } from "./sqliteDoctorCheckCreate.js"
import { runtimeDoctorCheckCreate } from "./runtimeDoctorCheckCreate.js"
import type { RcloneCommandRunner } from "../infrastructure/rclone/rcloneCommandRunner.js"
import { rcloneCommandRunnerProduction } from "../infrastructure/rclone/rcloneCommandRunnerProduction.js"
import type { ZitadelJwksClient } from "../infrastructure/zitadel/zitadelJwksClient.js"
import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import { zitadelDoctorCheckCreate } from "../infrastructure/zitadel/zitadelDoctorCheckCreate.js"
import type { DoctorCheckResult } from "./doctorCheckResult.js"
import type { Result } from "../schemas/resultSchema.js"

type DoctorAdaptersProductionOptions = {
  config: ServiceConfig
  storageAdapter?: StorageAdapter
  rcloneCommandRunner?: RcloneCommandRunner
  zitadel?: {
    config: ZitadelAuthConfig
    oidcClient: ZitadelOidcClient
    jwksClient: ZitadelJwksClient
    machineTokenCheck?: Parameters<typeof zitadelDoctorCheckCreate>[0]["machineTokenCheck"]
  }
}

export const doctorAdaptersProductionCreate = (options: DoctorAdaptersProductionOptions): DoctorCheckAdapters => {
  const storageAdapter =
    options.storageAdapter ??
    r2StorageAdapterCreate({
      accountId: options.config.r2AccountId,
      accessKeyId: options.config.r2AccessKeyId,
      secretAccessKey: options.config.r2SecretAccessKey,
      endpoint: options.config.r2Endpoint,
      defaultBucket: options.config.r2PrivateBucket ?? options.config.r2Bucket,
      allowedBuckets: [
        options.config.r2PrivateBucket ?? options.config.r2Bucket,
        options.config.r2PublicBucket ?? options.config.r2PrivateBucket ?? options.config.r2Bucket,
      ],
    })
  const adapters: DoctorCheckAdapters = {
    r2: r2DoctorCheckCreate({ config: options.config, adapter: storageAdapter }),
    rclone: async (): Promise<Result<DoctorCheckResult>> => {
      const result = await rcloneRemoteDoctor(
        options.config,
        options.rcloneCommandRunner ?? rcloneCommandRunnerProduction,
      )
      if (!result.success) return result
      return { success: true, data: { message: "gdrive_beta backup remote is reachable", details: result.data } }
    },
    sqlite: sqliteDoctorCheckCreate(options.config),
    ffprobe: ffprobeDoctorCheckCreate(options.config.ffprobeExecutable),
    runtime: runtimeDoctorCheckCreate(),
  }
  if (options.zitadel) adapters.zitadel = zitadelDoctorCheckCreate(options.zitadel)
  return adapters
}
