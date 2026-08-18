import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useNavigate, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiUploadAcceptAttributeRead } from "../upload/uiUploadAcceptAttributeRead.js"
import { uiUploadFoldersRead } from "../upload/uiUploadFoldersRead.js"
import { uiUploadMediaTypeRead } from "../upload/uiUploadMediaTypeRead.js"
import { uiUploadSha256Read } from "../upload/uiUploadSha256Read.js"
import type { UiUploadStage } from "../upload/uiUploadStageProgressRead.js"
import { uiUploadStageProgressRead } from "../upload/uiUploadStageProgressRead.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

/** Drives the direct browser-to-storage upload form and its progress states. */
export const uiUploadPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const projectId = createMemo(() => params.projectId)
  const file = createSignalObject<File | null>(null)
  const folder1 = createSignalObject("")
  const folder2 = createSignalObject("")
  const folder3 = createSignalObject("")
  const integrationNote = createSignalObject("")
  const stage = createSignalObject<UiUploadStage>("idle")
  const errorMessage = createSignalObject<string | null>(null)
  const assetId = createSignalObject<string | null>(null)
  const workflowId = createSignalObject<string | null>(null)
  const workflowStatus = createSignalObject<string | null>(null)
  const uploadStatus = createSignalObject<string | null>(null)

  const progress = createMemo(() => uiUploadStageProgressRead(stage.get()))
  const isBusy = () => !["idle", "done", "failed"].includes(stage.get())
  const fileError = createMemo(() => {
    const selected = file.get()
    if (selected === null) return null
    const mediaType = uiUploadMediaTypeRead(selected)
    return mediaType.success ? null : mediaType.errorMessage
  })
  const canSubmit = () =>
    file.get() !== null && fileError() === null && integrationNote.get().trim().length > 0 && !isBusy()

  const fail = (message: string) => {
    stage.set("failed")
    errorMessage.set(message)
    uiToastAdd({ tone: "negative", title: "Upload failed", description: message })
  }

  const submit = async () => {
    const selected = file.get()
    if (selected === null) return fail("Select a file before uploading")
    const note = integrationNote.get().trim()
    if (note.length === 0) return fail("Describe where this asset should be included")

    const folders = uiUploadFoldersRead([folder1.get(), folder2.get(), folder3.get()])
    if (!folders.success) return fail(folders.errorMessage)

    const mediaType = uiUploadMediaTypeRead(selected)
    if (!mediaType.success) return fail(mediaType.errorMessage)

    const client = uiApiClientRead()
    if (!client.success) return fail(client.errorMessage)

    errorMessage.set(null)
    assetId.set(null)
    stage.set("hashing")
    const bytes = new Uint8Array(await selected.arrayBuffer())
    const sha256 = await uiUploadSha256Read(bytes)
    if (!sha256.success) return fail(sha256.errorMessage)

    stage.set("requesting")
    const intent = await client.data.uploadIntentCreate(projectId(), {
      originalFilename: selected.name,
      folders: folders.data,
      integrationNote: note,
      byteSize: selected.size,
      mediaType: mediaType.data,
      sha256: sha256.data,
    })
    if (!intent.success) return fail(intent.errorMessage)

    stage.set("transferring")
    const transfer = await client.data.uploadObjectPut(intent.data.intent, bytes)
    if (!transfer.success) return fail(transfer.errorMessage)

    stage.set("completing")
    const completion = await client.data.uploadCompletionComplete(projectId(), intent.data.uploadId, {
      sha256: sha256.data,
    })
    if (!completion.success) return fail(completion.errorMessage)

    assetId.set(completion.data.assetId)
    workflowId.set(completion.data.workflowId)
    stage.set("done")
    uiToastAdd({ tone: "positive", title: "Upload accepted", description: "Processing has been queued." })
    await statusRefresh(intent.data.uploadId, completion.data.workflowId)
  }

  const statusRefresh = async (uploadId: string, workflow: string) => {
    const client = uiApiClientRead()
    if (!client.success) return
    const upload = await client.data.uploadRead(projectId(), uploadId)
    if (upload.success) uploadStatus.set(upload.data.status)
    const status = await client.data.workflowStatusRead(projectId(), workflow)
    if (status.success) workflowStatus.set(status.data.status)
  }

  return {
    projectId,
    file,
    folder1,
    folder2,
    folder3,
    integrationNote,
    stage: stage.get,
    progress,
    isBusy,
    canSubmit,
    errorMessage: errorMessage.get,
    fileError,
    acceptAttribute: uiUploadAcceptAttributeRead(),
    assetId: assetId.get,
    workflowId: workflowId.get,
    workflowStatus: workflowStatus.get,
    uploadStatus: uploadStatus.get,
    selectFile: (selected: File | null) => {
      file.set(selected)
      if (stage.get() !== "idle") stage.set("idle")
    },
    submit,
    openAsset: () => {
      const id = assetId.get()
      if (id === null) return
      navigate(uiPaths.asset(projectId(), id))
    },
    reset: () => {
      file.set(null)
      folder1.set("")
      folder2.set("")
      folder3.set("")
      integrationNote.set("")
      assetId.set(null)
      workflowId.set(null)
      workflowStatus.set(null)
      uploadStatus.set(null)
      errorMessage.set(null)
      stage.set("idle")
    },
  }
}
