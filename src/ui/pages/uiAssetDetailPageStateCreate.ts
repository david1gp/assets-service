import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams, useSearchParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { AssetDetailResponse } from "../../api-client/assetDetailResponseSchema.js"
import type { BackupReceipt } from "../../backup/backupReceiptSchema.js"
import type { DeletionState } from "../../deletion/deletionStateSchema.js"
import type { Environment } from "../../project/environmentSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { Workflow } from "../../workflow/workflowSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiOutputDraftFromDefinition } from "../output/uiOutputDraftFromDefinition.js"
import type { UiOutputDraft } from "../output/uiOutputDraftSchema.js"
import { uiOutputDraftsInputsRead } from "../output/uiOutputDraftsInputsRead.js"
import { uiOutputSetChangesRead } from "../output/uiOutputSetChangesRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiUploadFoldersRead } from "../upload/uiUploadFoldersRead.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

export type UiAssetDialog = "move" | "outputs" | "delete"

export type UiAssetActivity = {
  environment: Environment | null
  workflows: readonly Workflow[]
  backups: readonly BackupReceipt[]
  deletion: DeletionState | null
}

const dialogRead = (raw: string | string[] | undefined): UiAssetDialog | null => {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === "move" || value === "outputs" || value === "delete" ? value : null
}

const altValueRead = (asset: AssetDetailResponse): string => {
  const metadata = asset.metadata?.metadata
  if (metadata && "alt" in metadata && typeof metadata.alt === "string") return metadata.alt
  return ""
}

const draftIdCreate = () => `draft-${crypto.randomUUID()}`

/** Drives asset detail reads plus metadata, output-set, move, and delete mutations. */
export const uiAssetDetailPageStateCreate = () => {
  const params = useParams<{ projectId: string; assetId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const projectId = createMemo(() => params.projectId)
  const assetId = createMemo(() => params.assetId)
  const openDialog = createMemo<UiAssetDialog | null>(() => dialogRead(searchParams.dialog))

  const altDraft = createSignalObject("")
  const moveFolder1 = createSignalObject("")
  const moveFolder2 = createSignalObject("")
  const moveFolder3 = createSignalObject("")
  const moveFilename = createSignalObject("")
  const outputDrafts = createSignalObject<readonly UiOutputDraft[]>([])
  const pending = createSignalObject<string | null>(null)
  const actionError = createSignalObject<string | null>(null)
  const confirmOutputs = createSignalObject(false)
  const confirmDeletion = createSignalObject(false)

  const outputDraftsLoad = (asset: AssetDetailResponse) =>
    outputDrafts.set(asset.outputHistory.map((entry) => uiOutputDraftFromDefinition(entry.definition)))

  const query = uiQueryCreate<AssetDetailResponse>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiAssetDetailPageRead", client.errorMessage)
    const asset = await client.data.assetRead(projectId(), assetId())
    if (asset.success) {
      altDraft.set(altValueRead(asset.data))
      moveFilename.set(asset.data.filename)
      moveFolder1.set(asset.data.folders[0] ?? "")
      moveFolder2.set(asset.data.folders[1] ?? "")
      moveFolder3.set(asset.data.folders[2] ?? "")
      outputDraftsLoad(asset.data)
    }
    return asset
  })

  const activity = uiQueryCreate<UiAssetActivity>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiAssetDetailActivityRead", client.errorMessage)
    const project = await client.data.projectRead(projectId())
    if (!project.success) return project
    const environments = await client.data.environmentsRead(projectId())
    if (!environments.success) return environments
    const workflows = await client.data.workflowListRead(projectId(), { assetId: assetId(), limit: 10 })
    if (!workflows.success) return workflows
    const backups = await client.data.backupListRead(projectId(), { assetId: assetId(), limit: 10 })
    if (!backups.success) return backups
    const deletion = await client.data.deletionStatusOptionalRead(projectId(), assetId())
    if (!deletion.success) return deletion
    return {
      success: true,
      data: {
        environment:
          environments.data.environments.find((environment) => environment.name === project.data.defaultEnvironment) ??
          null,
        workflows: workflows.data.workflows,
        backups: backups.data.receipts,
        deletion: deletion.data,
      },
    }
  })

  const clientRead = () => {
    const client = uiApiClientRead()
    return client.success ? client.data : null
  }

  const run = async (label: string, action: () => Promise<Result<unknown>>, successTitle?: string) => {
    pending.set(label)
    actionError.set(null)
    const result = await action()
    pending.set(null)
    if (!result.success) {
      actionError.set(result.errorMessage)
      uiToastAdd({ tone: "negative", title: `${label} failed`, description: result.errorMessage })
      return false
    }
    uiToastAdd({ tone: "positive", title: successTitle ?? `${label} applied` })
    query.reload()
    activity.reload()
    return true
  }

  const altSet = () =>
    run("Alt text", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailAltSet", "The API client is unavailable")
      return client.assetMetadataSet(projectId(), assetId(), { alt: altDraft.get() })
    })

  const altUnset = () =>
    run("Alt text removal", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailAltUnset", "The API client is unavailable")
      return client.assetMetadataUnset(projectId(), assetId(), { field: "alt" })
    })

  const outputDraftSet = (id: string, field: keyof UiOutputDraft, value: string) =>
    outputDrafts.set(outputDrafts.get().map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft)))

  const outputDraftAdd = () => {
    const assetClass = query.data()?.class ?? "image"
    outputDrafts.set([
      ...outputDrafts.get(),
      {
        id: draftIdCreate(),
        key: "",
        width: assetClass === "image" ? "1600" : "",
        height: assetClass === "image" ? "900" : "",
        format: assetClass === "font" ? "woff2" : "webp",
        quality: "",
        aiLabel: "inherit",
      },
    ])
  }

  const outputDraftRemove = (id: string) => outputDrafts.set(outputDrafts.get().filter((draft) => draft.id !== id))

  const outputInputs = createMemo(() => uiOutputDraftsInputsRead(outputDrafts.get(), query.data()?.class ?? "image"))

  const outputChanges = createMemo(() => {
    const inputs = outputInputs()
    if (!inputs.success) return null
    const current = (query.data()?.outputHistory ?? []).map((entry) => entry.definition)
    return uiOutputSetChangesRead(current, inputs.data)
  })

  const outputSaveBlockedReason = createMemo<string | null>(() => {
    const inputs = outputInputs()
    if (!inputs.success) return inputs.errorMessage
    if (outputChanges()?.isDestructive && !confirmOutputs.get())
      return "Confirm the deletion of the published outputs above to enable saving."
    return null
  })

  const outputsSave = async () => {
    const inputs = outputInputs()
    if (!inputs.success) {
      actionError.set(inputs.errorMessage)
      return
    }
    const changes = outputChanges()
    if (changes?.isDestructive && !confirmOutputs.get()) {
      actionError.set("Confirm the deletion of the published outputs before saving the output set")
      return
    }
    const applied = await run("Output set", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailOutputsSave", "The API client is unavailable")
      return client.assetOutputsSet(projectId(), assetId(), { outputs: inputs.data })
    })
    if (!applied) return
    confirmOutputs.set(false)
    closeDialog()
  }

  const move = async () => {
    const folders = uiUploadFoldersRead([moveFolder1.get(), moveFolder2.get(), moveFolder3.get()])
    if (!folders.success) {
      actionError.set(folders.errorMessage)
      return
    }
    const applied = await run("Move", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailMove", "The API client is unavailable")
      return client.assetMove(projectId(), assetId(), { folders: folders.data, filename: moveFilename.get().trim() })
    })
    if (applied) closeDialog()
  }

  const deleteAsset = async () => {
    if (!confirmDeletion.get()) {
      actionError.set("Confirm the permanent deletion before requesting it")
      return
    }
    const applied = await run(
      "Deletion",
      async () => {
        const client = clientRead()
        if (!client) return resultErrorCreate("uiAssetDetailDelete", "The API client is unavailable")
        return client.assetDeleteRequest(projectId(), assetId())
      },
      "Deletion requested",
    )
    if (!applied) return
    confirmDeletion.set(false)
    closeDialog()
  }

  const closeDialog = () => setSearchParams({ dialog: null }, { replace: true })

  return {
    projectId,
    assetId,
    query,
    activity,
    altDraft,
    moveFolder1,
    moveFolder2,
    moveFolder3,
    moveFilename,
    outputDrafts: outputDrafts.get,
    outputDraftSet,
    outputDraftAdd,
    outputDraftRemove,
    outputChanges,
    outputError: () => (outputInputs().success ? null : (outputInputs() as { errorMessage: string }).errorMessage),
    confirmOutputs,
    confirmDeletion,
    outputSaveBlockedReason,
    openDialog,
    pendingLabel: pending.get,
    actionError: actionError.get,
    isPending: () => pending.get() !== null,
    openDialogSet: (dialog: UiAssetDialog) => {
      if (dialog === "delete") confirmDeletion.set(false)
      if (dialog === "outputs") confirmOutputs.set(false)
      setSearchParams({ dialog })
    },
    closeDialog,
    altSet,
    altUnset,
    outputsSave,
    outputsReset: () => {
      const asset = query.data()
      if (asset) outputDraftsLoad(asset)
      confirmOutputs.set(false)
      actionError.set(null)
    },
    move,
    deleteAsset,
  }
}
