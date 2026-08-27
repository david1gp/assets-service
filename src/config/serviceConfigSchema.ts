import * as v from "valibot"

import { environmentNameSchema } from "../schemas/environmentNameSchema.js"

export const serviceConfigSchema = v.strictObject({
  environment: environmentNameSchema,
  apiHost: v.pipe(v.string(), v.url()),
  apiPort: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
  databasePath: v.pipe(v.string(), v.minLength(1)),
  r2AccountId: v.pipe(v.string(), v.minLength(1)),
  r2AccessKeyId: v.pipe(v.string(), v.minLength(1)),
  r2SecretAccessKey: v.pipe(v.string(), v.minLength(1)),
  r2Bucket: v.pipe(v.string(), v.minLength(1)),
  r2PrivateBucket: v.optional(v.pipe(v.string(), v.minLength(1))),
  r2PublicBucket: v.optional(v.pipe(v.string(), v.minLength(1))),
  r2Endpoint: v.pipe(v.string(), v.url()),
  r2PublicBaseUrl: v.pipe(v.string(), v.url()),
  r2CustomDomainProbeKey: v.optional(v.pipe(v.string(), v.minLength(1))),
  workerId: v.pipe(v.string(), v.minLength(1)),
  rcloneExecutable: v.pipe(v.string(), v.minLength(1)),
  rcloneRemote: v.literal("gdrive_beta"),
  rcloneBackupRoot: v.literal("backups"),
  rcloneTimeoutMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  ffprobeExecutable: v.pipe(v.string(), v.minLength(1)),
  legacyImportRoots: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
})

export type ServiceConfig = v.InferOutput<typeof serviceConfigSchema>
