import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiAssetFolderPathsStateCreate } from "./uiAssetFolderPathsStateCreate.js"
import { uiUploadFoldersRead } from "../upload/uiUploadFoldersRead.js"
import { uiUploadIntegrationNoteRead } from "../upload/uiUploadIntegrationNoteRead.js"
import { uiUploadMediaTypeRead } from "../upload/uiUploadMediaTypeRead.js"
import { uiUploadSha256Read } from "../upload/uiUploadSha256Read.js"
import type { UiUploadMultiFileItem } from "../upload/UiUploadMultiFileItem.js"
import type { UiUploadStage } from "../upload/uiUploadStageProgressRead.js"
import { uiUploadStageProgressRead } from "../upload/uiUploadStageProgressRead.js"

const folderValuesRead = (folders: readonly string[]): string[] => {
  const values = [folders[0] ?? "", folders[1] ?? "", folders[2] ?? ""].map((value) => value.trim())
  const firstEmpty = values.findIndex((value) => value === "")
  if (firstEmpty >= 0) values.fill("", firstEmpty)
  return values
}

const folderValuesEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

/** Drives independent immediate uploads and canonical folder edits for the redesigned upload page. */
export const uiUploadMultiFileStateCreate = (input: { projectId: () => string }) => {
  const files = createSignalObject<UiUploadMultiFileItem[]>([])
  const folderPathsState = uiAssetFolderPathsStateCreate({
    projectId: input.projectId,
    isEnabled: () => files.get().length > 0,
  })
  let nextFileId = 0

  const fileRead = (fileId: string) => files.get().find((file) => file.id === fileId) ?? null
  const filesUpdate = (fileId: string, update: (file: UiUploadMultiFileItem) => UiUploadMultiFileItem) => {
    files.set(files.get().map((file) => (file.id === fileId ? update(file) : file)))
  }
  const fileSetStage = (fileId: string, stage: UiUploadStage) => {
    filesUpdate(fileId, (file) => ({ ...file, stage, progress: uiUploadStageProgressRead(stage) }))
  }
  const fileFail = (fileId: string, message: string) => {
    filesUpdate(fileId, (file) => ({
      ...file,
      stage: "failed",
      progress: uiUploadStageProgressRead("failed"),
      errorMessage: message,
    }))
  }

  const statusRefresh = async (fileId: string, uploadId: string, workflowId: string) => {
    const client = uiApiClientRead()
    if (!client.success) return
    if (typeof client.data.uploadRead === "function") {
      const upload = await client.data.uploadRead(input.projectId(), uploadId)
      if (upload.success) filesUpdate(fileId, (file) => ({ ...file, uploadStatus: upload.data.status }))
    }
    if (typeof client.data.workflowStatusRead === "function") {
      const status = await client.data.workflowStatusRead(input.projectId(), workflowId)
      if (status.success) filesUpdate(fileId, (file) => ({ ...file, workflowStatus: status.data.status }))
    }
  }

  const fileFoldersMove = async (fileId: string) => {
    const file = fileRead(fileId)
    if (file === null || file.stage !== "done" || file.assetId === null) return
    const folders = uiUploadFoldersRead(file.folders)
    if (!folders.success) {
      filesUpdate(fileId, (current) => ({ ...current, folderErrorMessage: folders.errorMessage }))
      return
    }
    if (folderValuesEqual(folders.data, file.canonicalFolders)) {
      filesUpdate(fileId, (current) => ({ ...current, folderErrorMessage: null, folderMovePending: false }))
      return
    }

    const client = uiApiClientRead()
    if (!client.success) {
      filesUpdate(fileId, (current) => ({
        ...current,
        folderErrorMessage: ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"),
      }))
      return
    }
    filesUpdate(fileId, (current) => ({ ...current, folderErrorMessage: null, folderMovePending: true }))
    const moved = await client.data.assetMove(input.projectId(), file.assetId, {
      folders: folders.data,
      filename: file.file.name,
    })
    if (!moved.success) {
      filesUpdate(fileId, (current) => ({
        ...current,
        folderErrorMessage: moved.errorMessage,
        folderMovePending: false,
      }))
      return
    }
    filesUpdate(fileId, (current) => ({
      ...current,
      canonicalFolders: folders.data,
      folderErrorMessage: null,
      folderMovePending: false,
    }))
  }

  const uploadFile = async (fileId: string) => {
    const selected = fileRead(fileId)
    if (selected === null) return

    const mediaType = uiUploadMediaTypeRead(selected.file)
    if (!mediaType.success) return fileFail(fileId, mediaType.errorMessage)
    const client = uiApiClientRead()
    if (!client.success)
      return fileFail(fileId, ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"))

    filesUpdate(fileId, (file) => ({ ...file, errorMessage: null }))
    fileSetStage(fileId, "hashing")
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await selected.file.arrayBuffer())
    } catch {
      return fileFail(fileId, ttc("The file could not be read", "Die Datei konnte nicht gelesen werden"))
    }
    const sha256 = await uiUploadSha256Read(bytes)
    if (!sha256.success) return fileFail(fileId, sha256.errorMessage)

    const current = fileRead(fileId)
    if (current === null) return
    const folders = uiUploadFoldersRead(current.folders)
    if (!folders.success) return fileFail(fileId, folders.errorMessage)

    fileSetStage(fileId, "requesting")
    const intent = await client.data.uploadIntentCreate(input.projectId(), {
      originalFilename: selected.file.name,
      folders: folders.data,
      integrationNote: uiUploadIntegrationNoteRead(selected.file.name),
      byteSize: selected.file.size,
      mediaType: mediaType.data,
      sha256: sha256.data,
    })
    if (!intent.success) return fileFail(fileId, intent.errorMessage)

    filesUpdate(fileId, (file) => ({ ...file, uploadId: intent.data.uploadId }))
    fileSetStage(fileId, "transferring")
    const transfer = await client.data.uploadObjectPut(intent.data.intent, bytes)
    if (!transfer.success) return fileFail(fileId, transfer.errorMessage)

    fileSetStage(fileId, "completing")
    const completion = await client.data.uploadCompletionComplete(input.projectId(), intent.data.uploadId, {
      sha256: sha256.data,
    })
    if (!completion.success) return fileFail(fileId, completion.errorMessage)

    filesUpdate(fileId, (file) => ({
      ...file,
      assetId: completion.data.assetId,
      workflowId: completion.data.workflowId,
      canonicalFolders: folders.data,
      stage: "done",
      progress: uiUploadStageProgressRead("done"),
    }))
    await statusRefresh(fileId, intent.data.uploadId, completion.data.workflowId)
    await fileFoldersMove(fileId)
  }

  const selectFiles = (selected: readonly File[]): string[] => {
    const added = selected.map((file) => {
      nextFileId += 1
      return {
        id: `upload-file-${nextFileId}`,
        file,
        folders: ["", "", ""],
        canonicalFolders: [],
        stage: "idle" as const,
        progress: uiUploadStageProgressRead("idle"),
        errorMessage: null,
        folderErrorMessage: null,
        folderMovePending: false,
        uploadId: null,
        assetId: null,
        workflowId: null,
        uploadStatus: null,
        workflowStatus: null,
      }
    })
    if (added.length === 0) return []
    files.set([...files.get(), ...added])
    for (const file of added) void uploadFile(file.id)
    return added.map((file) => file.id)
  }

  const setFileFolders = async (fileId: string, nextFolders: readonly string[]) => {
    const current = fileRead(fileId)
    if (current === null) return
    const folders = folderValuesRead(nextFolders)
    filesUpdate(fileId, (file) => ({ ...file, folders, folderErrorMessage: null }))
    await fileFoldersMove(fileId)
  }

  const setFileFolder = (fileId: string, level: 1 | 2 | 3, value: string) => {
    const current = fileRead(fileId)
    if (current === null) return Promise.resolve()
    const folders = [...current.folders]
    folders[level - 1] = value
    return setFileFolders(fileId, folders)
  }

  const folderOptions = (level: 1 | 2 | 3, parent1 = "", parent2 = ""): string[] => {
    const paths = folderPathsState.paths()
    const options = new Set<string>()
    for (const path of paths) {
      const segments = path.split("/")
      if (level === 1 && segments[0]) options.add(segments[0])
      if (level === 2 && segments[0] === parent1.trim() && segments[1]) options.add(segments[1])
      if (level === 3 && segments[0] === parent1.trim() && segments[1] === parent2.trim() && segments[2])
        options.add(segments[2])
    }
    return [...options].sort((left, right) => left.localeCompare(right))
  }

  return {
    files: files.get,
    folderQuery: folderPathsState.query,
    folderPaths: folderPathsState.paths,
    folderOptions,
    selectFiles,
    selectFile: (file: File) => selectFiles([file]),
    setFileFolder,
    setFileFolders,
    hasActiveUploads: () =>
      files.get().some((file) => ["hashing", "requesting", "transferring", "completing"].includes(file.stage)),
    clear: () => files.set([]),
  }
}
