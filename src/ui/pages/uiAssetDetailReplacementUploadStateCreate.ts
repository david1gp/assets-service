import { createMemo } from "solid-js"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AssetDetailResponse } from "../../api-client/assetDetailResponseSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiUploadAcceptAttributeRead } from "../upload/uiUploadAcceptAttributeRead.js"
import { uiUploadFoldersRead } from "../upload/uiUploadFoldersRead.js"
import { uiUploadMediaTypeRead } from "../upload/uiUploadMediaTypeRead.js"
import { uiUploadSha256Read } from "../upload/uiUploadSha256Read.js"
import type { UiUploadStage } from "../upload/uiUploadStageProgressRead.js"
import { uiUploadStageProgressRead } from "../upload/uiUploadStageProgressRead.js"

/** Drives a replacement source upload for the current asset detail page. */
export const uiAssetDetailReplacementUploadStateCreate = (input: {
  projectId: () => string
  assetId: () => string
  asset: () => AssetDetailResponse | null
  refresh: () => void
}) => {
  const file = createSignalObject<File | null>(null)
  const stage = createSignalObject<UiUploadStage>("idle")
  const errorMessage = createSignalObject<string | null>(null)

  const progress = createMemo(() => uiUploadStageProgressRead(stage.get()))
  const isBusy = () => !["idle", "done", "failed"].includes(stage.get())
  const fileError = createMemo(() => {
    const selected = file.get()
    if (selected === null) return null
    const mediaType = uiUploadMediaTypeRead(selected)
    return mediaType.success ? null : mediaType.errorMessage
  })
  const canSubmit = () => input.asset() !== null && file.get() !== null && fileError() === null && !isBusy()

  const fail = (message: string) => {
    stage.set("failed")
    errorMessage.set(message)
    uiToastAdd({
      tone: "negative",
      title: ttc("Replacement upload failed", "Ersatz-Upload fehlgeschlagen"),
      description: message,
    })
  }

  const selectFile = (selected: File | null) => {
    file.set(selected)
    stage.set("idle")
    errorMessage.set(null)
  }

  const submit = async () => {
    if (isBusy()) return

    const selected = file.get()
    if (selected === null)
      return fail(ttc("Select a replacement file before uploading", "Wähle vor dem Upload eine Ersatzdatei aus"))
    const asset = input.asset()
    if (asset === null)
      return fail(ttc("The asset details are not available", "Die Asset-Details sind nicht verfügbar"))

    const folders = uiUploadFoldersRead(asset.folders)
    if (!folders.success) return fail(folders.errorMessage)

    const mediaType = uiUploadMediaTypeRead(selected)
    if (!mediaType.success) return fail(mediaType.errorMessage)

    const client = uiApiClientRead()
    if (!client.success) return fail(ttc("The API client is unavailable", "Der API-Client ist nicht verfügbar"))

    const projectId = input.projectId()
    const assetId = input.assetId()
    const integrationNote = asset.integrationNote?.trim() || ttc("Replacement source revision", "Ersatz-Quellrevision")
    errorMessage.set(null)
    stage.set("hashing")

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await selected.arrayBuffer())
    } catch {
      return fail(ttc("The replacement file could not be read", "Die Ersatzdatei konnte nicht gelesen werden"))
    }
    const sha256 = await uiUploadSha256Read(bytes)
    if (!sha256.success) return fail(sha256.errorMessage)

    stage.set("requesting")
    const intent = await client.data.uploadIntentCreate(projectId, {
      assetId,
      originalFilename: selected.name,
      folders: folders.data,
      integrationNote,
      byteSize: selected.size,
      mediaType: mediaType.data,
      sha256: sha256.data,
    })
    if (!intent.success) return fail(intent.errorMessage)

    stage.set("transferring")
    const transfer = await client.data.uploadObjectPut(intent.data.intent, bytes)
    if (!transfer.success) return fail(transfer.errorMessage)

    stage.set("completing")
    const completion = await client.data.uploadCompletionComplete(projectId, intent.data.uploadId, {
      sha256: sha256.data,
    })
    if (!completion.success) return fail(completion.errorMessage)

    stage.set("done")
    input.refresh()
    uiToastAdd({
      tone: "positive",
      title: ttc("Replacement upload accepted", "Ersatz-Upload angenommen"),
      description: ttc("A new source revision is queued.", "Eine neue Quellrevision wurde eingereiht."),
    })
  }

  return {
    file,
    stage: stage.get,
    progress,
    isBusy,
    canSubmit,
    errorMessage: errorMessage.get,
    fileError,
    acceptAttribute: uiUploadAcceptAttributeRead(),
    selectFile,
    submit,
    reset: () => {
      file.set(null)
      stage.set("idle")
      errorMessage.set(null)
    },
  }
}
