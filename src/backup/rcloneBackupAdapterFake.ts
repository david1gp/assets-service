import * as v from "valibot"

import type { RcloneBackupAdapter } from "./rcloneBackupAdapter.js"
import type { RcloneBackupDeleteAdapter } from "./rcloneBackupDeleteAdapter.js"
import { rcloneBackupRequestSchema } from "./rcloneBackupRequestSchema.js"
import { rcloneErrorCreate } from "./rcloneErrorCreate.js"
import { rcloneRemotePathCreate } from "./rcloneRemotePathCreate.js"

type RcloneBackupAdapterFakeFailure = "cancelled" | "copy_failed" | "timeout" | "verification_failed"

type RcloneBackupAdapterFakeOptions = {
  failure?: RcloneBackupAdapterFakeFailure
  completedAt?: string
}

type RcloneBackupAdapterFakeInvocation = {
  args: ["copyto", string, string] | ["deletefile", string]
}

type RcloneBackupAdapterFakeInstance = RcloneBackupAdapter & {
  invocations: RcloneBackupAdapterFakeInvocation[]
  deleteObject: RcloneBackupDeleteAdapter
  objects: Map<string, { byteSize: number; sha256: string }>
}

export const rcloneBackupAdapterFake = (
  options: RcloneBackupAdapterFakeOptions = {},
): RcloneBackupAdapterFakeInstance => {
  const invocations: RcloneBackupAdapterFakeInvocation[] = []
  const objects = new Map<string, { byteSize: number; sha256: string }>()
  const deleteObject: RcloneBackupDeleteAdapter = async (remotePath, operationOptions = {}) => {
    if (operationOptions.signal?.aborted)
      return rcloneErrorCreate("rcloneBackupAdapterFakeDelete", "cancelled", "rclone operation was cancelled")
    invocations.push({ args: ["deletefile", remotePath] })
    objects.delete(remotePath)
    return { success: true, data: undefined }
  }

  const adapter: RcloneBackupAdapter = async (input, operationOptions = {}) => {
    const op = "rcloneBackupAdapterFake"
    const parsed = v.safeParse(rcloneBackupRequestSchema, input)
    if (!parsed.success) return rcloneErrorCreate(op, "invalid_request", "fake received an invalid request")
    if (operationOptions.signal?.aborted || options.failure === "cancelled") {
      return rcloneErrorCreate(op, "cancelled", "rclone operation was cancelled")
    }
    if (options.failure === "timeout") return rcloneErrorCreate(op, "timeout", "rclone operation timed out")

    const request = parsed.output
    const path = rcloneRemotePathCreate(
      {
        remote: "gdrive_beta",
        backupRoot: "backups",
        organizationName: request.organizationName,
        projectName: request.projectName,
        logicalFolders: request.logicalFolders,
        sourceRevisionId: request.sourceRevisionId,
        originalFilename: request.originalFilename,
      },
      operationOptions.backupDate ?? new Date(),
    )
    if (!path.success) return path
    invocations.push({ args: ["copyto", request.localSourcePath, path.data] })
    if (options.failure === "copy_failed") return rcloneErrorCreate(op, "copy_failed", "fake copyto failed")
    if (options.failure === "verification_failed") {
      return rcloneErrorCreate(op, "verification_failed", "fake remote verification failed")
    }

    objects.set(path.data, { byteSize: request.expectedByteSize, sha256: request.expectedSha256 })
    return {
      success: true,
      data: {
        remotePath: path.data,
        byteSize: request.expectedByteSize,
        sha256: request.expectedSha256,
        checkResult: "verified",
        completedAt: options.completedAt ?? "2026-01-01T00:00:00.000Z",
        commandMode: "copyto",
      },
    }
  }

  return Object.assign(adapter, { invocations, deleteObject, objects })
}
