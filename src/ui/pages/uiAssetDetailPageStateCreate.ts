import { useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { type AssetDetailResponse, assetDetailResponseSchema } from "../../api-client/assetDetailResponseSchema.js"
import { metadataSetRequestSchema } from "../../api-client/metadataSetRequestSchema.js"
import { assetFilenameSchema } from "../../asset/assetFilenameSchema.js"
import { folderSegmentSchema } from "../../asset/folderSegmentSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiPublicUrlFormat } from "../common/uiPublicUrlFormat.js"
import { uiOutputDraftFromDefinition } from "../output/uiOutputDraftFromDefinition.js"
import { type UiOutputDraft, uiOutputDraftSchema } from "../output/uiOutputDraftSchema.js"
import { uiOutputDraftsInputsRead } from "../output/uiOutputDraftsInputsRead.js"
import { uiOutputSetChangesRead } from "../output/uiOutputSetChangesRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSearchParamPicklistRead } from "../search/uiSearchParamPicklistRead.js"
import { uiFormDraftKeyCreate } from "../storage/uiFormDraftKeyCreate.js"
import { uiFormDraftPersistenceCreate } from "../storage/uiFormDraftPersistenceCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiUploadFoldersRead } from "../upload/uiUploadFoldersRead.js"
import { type UiAssetActivity, uiAssetActivitySchema } from "./uiAssetActivitySchema.js"
import { type UiAssetDialog, uiAssetDialogSchema } from "./uiAssetDialogSchema.js"
import { uiSourceRevisionLatestImageRead } from "./uiSourceRevisionLatestImageRead.js"

const assetAltDraftSchema = v.strictObject({ value: metadataSetRequestSchema.entries.alt })

const assetMoveDraftSchema = v.strictObject({
  folder1: v.union([v.literal(""), folderSegmentSchema]),
  folder2: v.union([v.literal(""), folderSegmentSchema]),
  folder3: v.union([v.literal(""), folderSegmentSchema]),
  filename: v.union([v.literal(""), assetFilenameSchema]),
})

const assetOutputsDraftSchema = v.strictObject({ drafts: v.array(uiOutputDraftSchema) })

type UiAssetAltDraft = v.InferOutput<typeof assetAltDraftSchema>
type UiAssetMoveDraft = v.InferOutput<typeof assetMoveDraftSchema>
type UiAssetOutputsDraft = v.InferOutput<typeof assetOutputsDraftSchema>

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
  const openDialog = createMemo<UiAssetDialog | null>(() => {
    const move = uiSearchParamPicklistRead(uiAssetDialogSchema, searchParams.moveDialog)
    if (move === "move") return move
    const outputs = uiSearchParamPicklistRead(uiAssetDialogSchema, searchParams.outputsDialog)
    if (outputs === "outputs") return outputs
    const deletion = uiSearchParamPicklistRead(uiAssetDialogSchema, searchParams.deleteDialog)
    if (deletion === "delete") return deletion
    // Keep existing shared links readable; new dialog state uses the distinct keys above.
    return uiSearchParamPicklistRead(uiAssetDialogSchema, searchParams.dialog) ?? null
  })

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

  const altDraftPersistence = uiFormDraftPersistenceCreate<UiAssetAltDraft>(
    () => uiFormDraftKeyCreate("asset", `${projectId()}:${assetId()}`, "alt"),
    assetAltDraftSchema,
    () => ({ value: altDraft.get() }),
  )
  const moveDraftPersistence = uiFormDraftPersistenceCreate<UiAssetMoveDraft>(
    () => uiFormDraftKeyCreate("asset", `${projectId()}:${assetId()}`, "move"),
    assetMoveDraftSchema,
    () => ({
      folder1: moveFolder1.get(),
      folder2: moveFolder2.get(),
      folder3: moveFolder3.get(),
      filename: moveFilename.get(),
    }),
  )
  const outputsDraftPersistence = uiFormDraftPersistenceCreate<UiAssetOutputsDraft>(
    () => uiFormDraftKeyCreate("asset", `${projectId()}:${assetId()}`, "outputs"),
    assetOutputsDraftSchema,
    () => ({ drafts: [...outputDrafts.get()] }),
  )
  let altDraftActive = false
  let moveDraftActive = false
  let outputsDraftActive = false

  const altHydrated = altDraftPersistence.hydrate()
  if (altHydrated.success && altHydrated.data !== undefined) {
    altDraftActive = true
    altDraft.set(altHydrated.data.value)
  }
  const moveHydrated = moveDraftPersistence.hydrate()
  if (moveHydrated.success && moveHydrated.data !== undefined) {
    moveDraftActive = true
    moveFolder1.set(moveHydrated.data.folder1)
    moveFolder2.set(moveHydrated.data.folder2)
    moveFolder3.set(moveHydrated.data.folder3)
    moveFilename.set(moveHydrated.data.filename)
  }
  const outputsHydrated = outputsDraftPersistence.hydrate()
  if (outputsHydrated.success && outputsHydrated.data !== undefined) {
    outputsDraftActive = true
    outputDrafts.set(outputsHydrated.data.drafts)
  }
  const altDraftSignal = altDraftPersistence.signalCreate(altDraft, () => {
    altDraftActive = true
  })
  const moveFolder1Draft = moveDraftPersistence.signalCreate(moveFolder1, () => {
    moveDraftActive = true
  })
  const moveFolder2Draft = moveDraftPersistence.signalCreate(moveFolder2, () => {
    moveDraftActive = true
  })
  const moveFolder3Draft = moveDraftPersistence.signalCreate(moveFolder3, () => {
    moveDraftActive = true
  })
  const moveFilenameDraft = moveDraftPersistence.signalCreate(moveFilename, () => {
    moveDraftActive = true
  })

  const outputDraftsLoad = (asset: AssetDetailResponse) =>
    outputDrafts.set(asset.outputHistory.map((entry) => uiOutputDraftFromDefinition(entry.definition)))

  const query = uiQueryCreate<AssetDetailResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetDetailPageRead", client.errorMessage)
      return client.data.assetRead(projectId(), assetId())
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("asset", `${projectId()}:${assetId()}`),
      cacheSchema: assetDetailResponseSchema,
    },
  )

  const activity = uiQueryCreate<UiAssetActivity>(
    async () => {
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
            environments.data.environments.find(
              (environment) => environment.name === project.data.defaultEnvironment,
            ) ?? null,
          workflows: workflows.data.workflows,
          backups: backups.data.receipts,
          deletion: deletion.data,
        },
      }
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("asset-activity", `${projectId()}:${assetId()}`),
      cacheSchema: uiAssetActivitySchema,
    },
  )

  createEffect(() => {
    const asset = query.data()
    if (asset === null) return
    if (!altDraftActive) altDraft.set(altValueRead(asset))
    if (!moveDraftActive) {
      moveFilename.set(asset.filename)
      moveFolder1.set(asset.folders[0] ?? "")
      moveFolder2.set(asset.folders[1] ?? "")
      moveFolder3.set(asset.folders[2] ?? "")
    }
    if (!outputsDraftActive) outputDraftsLoad(asset)
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

  const altSet = async () => {
    const applied = await run("Alt text", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailAltSet", "The API client is unavailable")
      return client.assetMetadataSet(projectId(), assetId(), { alt: altDraft.get() })
    })
    if (applied) await altDraftPersistence.clear()
  }

  const altUnset = async () => {
    const applied = await run("Alt text removal", async () => {
      const client = clientRead()
      if (!client) return resultErrorCreate("uiAssetDetailAltUnset", "The API client is unavailable")
      return client.assetMetadataUnset(projectId(), assetId(), { field: "alt" })
    })
    if (!applied) return
    altDraft.set("")
    await altDraftPersistence.clear()
  }

  const outputDraftSet = (id: string, field: keyof UiOutputDraft, value: string) => {
    outputDrafts.set(outputDrafts.get().map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft)))
    outputsDraftActive = true
    void outputsDraftPersistence.persist()
  }

  const outputDraftAdd = () => {
    const assetClass = query.data()?.class ?? "image"
    outputDrafts.set([
      ...outputDrafts.get(),
      {
        id: draftIdCreate(),
        key: "",
        width: assetClass === "image" ? "1600" : "",
        height: assetClass === "image" ? "900" : "",
        format: assetClass === "font" ? "woff2" : "avif",
        quality: "",
        aiLabel: "inherit",
      },
    ])
    outputsDraftActive = true
    void outputsDraftPersistence.persist()
  }

  const outputDraftRemove = (id: string) => {
    outputDrafts.set(outputDrafts.get().filter((draft) => draft.id !== id))
    outputsDraftActive = true
    void outputsDraftPersistence.persist()
  }

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

  const sourceRevisionLinks = createMemo(() => {
    const asset = query.data()
    const client = clientRead()
    if (asset === null || client === null) return []
    return asset.sourceHistory.map((revision) => ({
      ...revision,
      contentUrl: client.assetSourceRevisionContentUrlCreate(projectId(), assetId(), revision.id, "download"),
      previewUrl: client.assetSourceRevisionContentUrlCreate(projectId(), assetId(), revision.id, "preview"),
    }))
  })

  const latestImagePreview = createMemo(() => {
    const asset = query.data()
    const revision = uiSourceRevisionLatestImageRead(sourceRevisionLinks())
    if (asset === null || revision === null) return null
    return {
      ...revision,
      contentUrl: revision.previewUrl,
      alt: altValueRead(asset) || `Preview of ${revision.originalFilename}`,
    }
  })

  const outputHistoryLinks = createMemo(() => {
    const publicBaseUrl = activity.data()?.environment?.publicBaseUrl
    const client = clientRead()
    return (query.data()?.outputHistory ?? []).map((entry) => ({
      ...entry,
      versions: entry.versions.map((version) => ({
        ...version,
        publicUrl: publicBaseUrl ? uiPublicUrlFormat(publicBaseUrl, version.objectKey) : null,
        downloadUrl: client ? client.assetOutputVersionContentUrlCreate(projectId(), assetId(), version.id) : null,
        downloadFilename: `${entry.definition.key}.${version.extension}`,
      })),
    }))
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
    await outputsDraftPersistence.clear()
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
    if (!applied) return
    await moveDraftPersistence.clear()
    closeDialog()
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
    await Promise.all([altDraftPersistence.clear(), moveDraftPersistence.clear(), outputsDraftPersistence.clear()])
    closeDialog()
  }

  const closeDialog = () =>
    setSearchParams({ moveDialog: null, outputsDialog: null, deleteDialog: null, dialog: null }, { replace: true })

  return {
    projectId,
    assetId,
    query,
    activity,
    altDraft: altDraftSignal,
    moveFolder1: moveFolder1Draft,
    moveFolder2: moveFolder2Draft,
    moveFolder3: moveFolder3Draft,
    moveFilename: moveFilenameDraft,
    outputDrafts,
    outputDraftSet,
    outputDraftAdd,
    outputDraftRemove,
    outputChanges,
    outputError: () => (outputInputs().success ? null : (outputInputs() as { errorMessage: string }).errorMessage),
    confirmOutputs,
    confirmDeletion,
    outputSaveBlockedReason,
    sourceRevisionLinks,
    latestImagePreview,
    outputHistoryLinks,
    openDialog,
    pendingLabel: pending.get,
    actionError: actionError.get,
    isPending: () => pending.get() !== null,
    openDialogSet: (dialog: UiAssetDialog) => {
      if (dialog === "delete") confirmDeletion.set(false)
      if (dialog === "outputs") confirmOutputs.set(false)
      setSearchParams({
        moveDialog: dialog === "move" ? dialog : null,
        outputsDialog: dialog === "outputs" ? dialog : null,
        deleteDialog: dialog === "delete" ? dialog : null,
        dialog: null,
      })
    },
    closeDialog,
    altSet,
    altUnset,
    outputsSave,
    outputsReset: () => {
      const asset = query.data()
      if (asset) {
        outputDraftsLoad(asset)
        outputsDraftActive = true
        void outputsDraftPersistence.persist()
      }
      confirmOutputs.set(false)
      actionError.set(null)
    },
    move,
    deleteAsset,
  }
}
