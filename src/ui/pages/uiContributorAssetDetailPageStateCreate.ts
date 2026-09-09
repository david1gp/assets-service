import { useParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { type AssetDetailResponse, assetDetailResponseSchema } from "../../api-client/assetDetailResponseSchema.js"
import { integrationNoteSetRequestSchema } from "../../api-client/integrationNoteSetRequestSchema.js"
import { metadataSetRequestSchema } from "../../api-client/metadataSetRequestSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { ttc } from "../localization/ttc.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiFormDraftKeyCreate } from "../storage/uiFormDraftKeyCreate.js"
import { uiFormDraftPersistenceCreate } from "../storage/uiFormDraftPersistenceCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { uiSourceRevisionLatestImageRead } from "./uiSourceRevisionLatestImageRead.js"

const contributorAltDraftSchema = v.strictObject({ value: metadataSetRequestSchema.entries.alt })
const contributorIntegrationNoteDraftSchema = v.strictObject({
  value: integrationNoteSetRequestSchema.entries.integrationNote,
})

/** Holds the simplified contributor preview and alternative-text edit. */
export const uiContributorAssetDetailPageStateCreate = () => {
  const params = useParams<{ projectId: string; assetId: string }>()
  const projectId = createMemo(() => params.projectId)
  const assetId = createMemo(() => params.assetId)
  const altDraftState = createSignalObject("")
  const integrationNoteDraftState = createSignalObject("")
  const pending = createSignalObject(false)
  const actionError = createSignalObject<string | null>(null)
  let draftActive = false
  let integrationNoteDraftActive = false

  const query = uiQueryCreate<AssetDetailResponse>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiContributorAssetDetailRead", client.errorMessage)
      return client.data.assetRead(projectId(), assetId())
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("asset", `${projectId()}:${assetId()}`),
      cacheSchema: assetDetailResponseSchema,
    },
  )

  const draftPersistence = uiFormDraftPersistenceCreate(
    () => uiFormDraftKeyCreate("contributor-asset", `${projectId()}:${assetId()}`, "alt"),
    contributorAltDraftSchema,
    () => ({ value: altDraftState.get() }),
  )
  const hydrated = draftPersistence.hydrate()
  if (hydrated.success && hydrated.data !== undefined) {
    draftActive = true
    altDraftState.set(hydrated.data.value)
  }
  const altDraft = draftPersistence.signalCreate(altDraftState, () => {
    draftActive = true
  })

  const integrationNoteDraftPersistence = uiFormDraftPersistenceCreate(
    () => uiFormDraftKeyCreate("contributor-asset", `${projectId()}:${assetId()}`, "integration-note"),
    contributorIntegrationNoteDraftSchema,
    () => ({ value: integrationNoteDraftState.get() }),
  )
  const integrationNoteHydrated = integrationNoteDraftPersistence.hydrate()
  if (integrationNoteHydrated.success && integrationNoteHydrated.data !== undefined) {
    integrationNoteDraftActive = true
    integrationNoteDraftState.set(integrationNoteHydrated.data.value)
  }
  const integrationNoteDraft = integrationNoteDraftPersistence.signalCreate(integrationNoteDraftState, () => {
    integrationNoteDraftActive = true
  })

  const altRead = (asset: AssetDetailResponse) => {
    const metadata = asset.metadata?.metadata
    return metadata && "alt" in metadata && typeof metadata.alt === "string" ? metadata.alt : ""
  }

  createEffect(() => {
    const asset = query.data()
    if (asset === null) return
    if (!draftActive) altDraftState.set(altRead(asset))
    if (!integrationNoteDraftActive) integrationNoteDraftState.set(asset.integrationNote ?? "")
  })

  const latestOriginal = createMemo(() => {
    const asset = query.data()
    const client = uiApiClientRead()
    if (asset === null || !client.success || asset.sourceHistory.length === 0) return null
    const source = [...asset.sourceHistory].sort((first, second) => second.revision - first.revision)[0]
    if (source === undefined) return null
    return {
      filename: source.originalFilename,
      downloadUrl: client.data.assetSourceRevisionContentUrlCreate(projectId(), assetId(), source.id, "download"),
    }
  })

  const preview = createMemo(() => {
    const asset = query.data()
    const client = uiApiClientRead()
    if (asset === null || !client.success) return null
    const source = uiSourceRevisionLatestImageRead(asset.sourceHistory)
    if (source === null) return null
    return {
      url: client.data.assetSourceRevisionContentUrlCreate(projectId(), assetId(), source.id, "preview"),
      alt: altRead(asset) || ttc(`Preview of ${asset.filename}`, `Vorschau von ${asset.filename}`),
    }
  })

  const altSave = async () => {
    if (pending.get()) return
    pending.set(true)
    actionError.set(null)
    const client = uiApiClientRead()
    const result = client.success
      ? await client.data.assetMetadataSet(projectId(), assetId(), { alt: altDraftState.get() })
      : resultErrorCreate("uiContributorAssetAltSave", client.errorMessage)
    pending.set(false)
    if (!result.success) {
      actionError.set(result.errorMessage)
      uiToastAdd({
        tone: "negative",
        title: ttc("Could not save description", "Beschreibung konnte nicht gespeichert werden"),
        description: result.errorMessage,
      })
      return
    }
    await draftPersistence.clear()
    draftActive = false
    query.reload()
    uiToastAdd({ tone: "positive", title: ttc("Description saved", "Beschreibung gespeichert") })
  }

  const altRemove = async () => {
    if (pending.get()) return
    pending.set(true)
    actionError.set(null)
    const client = uiApiClientRead()
    const result = client.success
      ? await client.data.assetMetadataUnset(projectId(), assetId(), { field: "alt" })
      : resultErrorCreate("uiContributorAssetAltRemove", client.errorMessage)
    pending.set(false)
    if (!result.success) {
      actionError.set(result.errorMessage)
      uiToastAdd({
        tone: "negative",
        title: ttc("Could not remove alternative text", "Alternativtext konnte nicht entfernt werden"),
        description: result.errorMessage,
      })
      return
    }
    altDraftState.set("")
    await draftPersistence.clear()
    draftActive = false
    query.reload()
    uiToastAdd({ tone: "positive", title: ttc("Description removed", "Beschreibung entfernt") })
  }

  const integrationNoteSave = async () => {
    if (pending.get()) return
    pending.set(true)
    actionError.set(null)
    const client = uiApiClientRead()
    const result = client.success
      ? await client.data.assetIntegrationNoteSet(projectId(), assetId(), {
          integrationNote: integrationNoteDraftState.get(),
        })
      : resultErrorCreate("uiContributorAssetIntegrationNoteSave", client.errorMessage)
    pending.set(false)
    if (!result.success) {
      actionError.set(result.errorMessage)
      uiToastAdd({
        tone: "negative",
        title: ttc("Could not save usage note", "Hinweis zur Verwendung konnte nicht gespeichert werden"),
        description: result.errorMessage,
      })
      return
    }
    await integrationNoteDraftPersistence.clear()
    integrationNoteDraftActive = false
    query.reload()
    uiToastAdd({ tone: "positive", title: ttc("Usage note saved", "Hinweis zur Verwendung gespeichert") })
  }

  return {
    query,
    pageTitle: () => query.data()?.filename ?? ttc("Asset details", "Asset-Details"),
    altDraft,
    integrationNoteDraft,
    preview,
    latestOriginal,
    isPending: pending.get,
    actionError: actionError.get,
    assetsPath: () => uiPaths.contributor.assets(projectId()),
    altSave,
    altRemove,
    integrationNoteSave,
    altSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void altSave()
    },
    altRemoveClick: () => void altRemove(),
    integrationNoteSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void integrationNoteSave()
    },
  }
}
