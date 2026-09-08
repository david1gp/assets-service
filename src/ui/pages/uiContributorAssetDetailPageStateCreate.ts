import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { type AssetDetailResponse, assetDetailResponseSchema } from "../../api-client/assetDetailResponseSchema.js"
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

/** Holds the simplified contributor preview and alternative-text edit. */
export const uiContributorAssetDetailPageStateCreate = () => {
  const params = useParams<{ projectId: string; assetId: string }>()
  const projectId = createMemo(() => params.projectId)
  const assetId = createMemo(() => params.assetId)
  const altDraftState = createSignalObject("")
  const pending = createSignalObject(false)
  const actionError = createSignalObject<string | null>(null)
  let draftActive = false

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

  const altRead = (asset: AssetDetailResponse) => {
    const metadata = asset.metadata?.metadata
    return metadata && "alt" in metadata && typeof metadata.alt === "string" ? metadata.alt : ""
  }

  createEffect(() => {
    const asset = query.data()
    if (asset !== null && !draftActive) altDraftState.set(altRead(asset))
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

  return {
    query,
    pageTitle: () => query.data()?.filename ?? ttc("Asset details", "Asset-Details"),
    altDraft,
    preview,
    latestOriginal,
    isPending: pending.get,
    actionError: actionError.get,
    assetsPath: () => uiPaths.contributor.assets(projectId()),
    altSave,
    altRemove,
    altSubmit: (event: SubmitEvent) => {
      event.preventDefault()
      void altSave()
    },
    altRemoveClick: () => void altRemove(),
  }
}
