import * as v from "valibot"

import type { StorageMigrationBindingSnapshot } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { storageMigrationBindingSnapshotSchema } from "../migration/storageMigrationBindingSnapshotSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { StorageNamespace } from "./storageNamespaceSchema.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"
import { storageObjectLocationCreate } from "./storageObjectLocationCreate.js"

type StorageMigrationSignedLocation = StorageObjectLocation & { bucket: string; objectKey: string }

export const storageMigrationObjectLocationCreate = (input: {
  sourceBinding: StorageMigrationBindingSnapshot
  targetBinding: StorageMigrationBindingSnapshot
  namespace: StorageNamespace
  key: string
}): Result<{
  source: StorageMigrationSignedLocation
  destination: StorageMigrationSignedLocation
}> => {
  const op = "storageMigrationObjectLocationCreate"
  const sourceBinding = v.safeParse(storageMigrationBindingSnapshotSchema, input.sourceBinding)
  if (!sourceBinding.success) return resultErrorCreate(op, v.summarize(sourceBinding.issues), input.sourceBinding)
  const targetBinding = v.safeParse(storageMigrationBindingSnapshotSchema, input.targetBinding)
  if (!targetBinding.success) return resultErrorCreate(op, v.summarize(targetBinding.issues), input.targetBinding)
  if (
    sourceBinding.output.projectId !== targetBinding.output.projectId ||
    sourceBinding.output.environmentId !== targetBinding.output.environmentId ||
    sourceBinding.output.environment !== targetBinding.output.environment
  )
    return resultErrorCreate(op, "Migration bindings must belong to the same project and environment")
  if (
    !storageMigrationPrefixValid(sourceBinding.output.prefix) ||
    !storageMigrationPrefixValid(targetBinding.output.prefix)
  )
    return resultErrorCreate(op, "Migration binding prefixes must be relative path prefixes")

  const source = storageObjectLocationCreate(storageBindingRead(sourceBinding.output), input.namespace, input.key)
  if (!source.success) return source
  const destination = storageObjectLocationCreate(storageBindingRead(targetBinding.output), input.namespace, input.key)
  if (!destination.success) return destination
  return { success: true, data: { source: source.data, destination: destination.data } }
}

function storageBindingRead(binding: StorageMigrationBindingSnapshot): {
  projectId: string
  environment: StorageMigrationBindingSnapshot["environment"]
  bucket: string
  prefix: string
  publicBaseUrl: string
} {
  return {
    projectId: binding.projectId,
    environment: binding.environment,
    bucket: binding.bucket,
    prefix: binding.prefix,
    publicBaseUrl: binding.publicBaseUrl,
  }
}

function storageMigrationPrefixValid(prefix: string): boolean {
  return (
    prefix.length === 0 ||
    (!prefix.startsWith("/") &&
      !prefix.endsWith("/") &&
      !prefix.includes("\\") &&
      !/\p{Cc}/u.test(prefix) &&
      prefix.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."))
  )
}
