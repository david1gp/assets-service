import { uploadStatusSchema, type UploadStatus } from "./uploadStatusSchema.js"
import { type Upload } from "./uploadSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { assetsApiClientCreate } from "../api-client/assetsApiClientCreate.js"

type AssetsApiClient = Extract<ReturnType<typeof assetsApiClientCreate>, { success: true }>["data"]

export type UploadsListOptions = {
  today?: boolean
  days?: number
  limit?: number
  status?: UploadStatus
}

export const uploadsListHumanOutputRead = (uploads: readonly Upload[]): string => {
  if (uploads.length === 0) return "No uploads found.\n"
  const lines: string[] = []
  for (const upload of uploads) {
    const folderPath = upload.folders.length > 0 ? `${upload.folders.join("/")}/` : ""
    const path = `${folderPath}${upload.originalFilename}`
    lines.push(`- ${upload.id} [${upload.status}] ${path} (${upload.byteSize} bytes, ${upload.createdAt})`)
  }
  return `${lines.join("\n")}\n`
}

export const uploadsListRun = async (
  client: AssetsApiClient,
  projectId: string,
  options: UploadsListOptions = {},
): Promise<Result<{ uploads: readonly Upload[]; humanOutput: string }>> => {
  const op = "uploadsListRun"
  if (options.today && options.days !== undefined) {
    return resultErrorCreate(op, "--today and --days cannot be used together")
  }

  let minCreatedAt: Date | undefined
  if (options.today) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    minCreatedAt = today
  } else if (options.days !== undefined) {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - options.days)
    pastDate.setHours(0, 0, 0, 0)
    minCreatedAt = pastDate
  }

  const uploadsResult = await client.uploadsReadAll(
    projectId,
    options.status === undefined ? {} : { status: options.status },
  )
  if (!uploadsResult.success) return uploadsResult

  let filtered = [...uploadsResult.data]
  if (minCreatedAt !== undefined) {
    const minTime = minCreatedAt.getTime()
    filtered = filtered.filter((u) => new Date(u.createdAt).getTime() >= minTime)
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (options.limit !== undefined) {
    filtered = filtered.slice(0, options.limit)
  }

  return {
    success: true,
    data: {
      uploads: filtered,
      humanOutput: uploadsListHumanOutputRead(filtered),
    },
  }
}
