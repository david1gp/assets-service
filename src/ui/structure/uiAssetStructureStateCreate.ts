import { createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AssetListQuery } from "../../api-client/assetListQuerySchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"
import { type UiAssetStructure, uiAssetStructureSchema } from "./uiAssetStructureSchema.js"
import { uiStructureFolderOptionsRead, uiStructureUnassignedOptionValue } from "./uiStructureFolderOptionsRead.js"
import { uiStructureTreeCreate } from "./uiStructureTreeCreate.js"

/**
 * Loads the logical folder tree of one project and applies membership moves
 * optimistically. A move only rewrites membership and never touches the
 * canonical folders of an asset.
 */
export const uiAssetStructureStateCreate = (input: {
  projectId: () => string
  isActive: () => boolean
  /** Active URL filters, shared with the list view so both show the same assets. */
  filters: () => Pick<AssetListQuery, "class" | "folder" | "search">
  cursor: () => number | undefined
  cursorSet: (cursor: string | null) => void

  isFolderDialogOpen: () => boolean
  folderDialogOpenSet: (open: boolean) => void
}) => {
  const pendingAssetIds = createSignalObject<ReadonlySet<string>>(new Set())
  const isFolderPending = createSignalObject(false)
  const actionError = createSignalObject<string | null>(null)
  const folderNameDraft = createSignalObject("")
  const folderParentDraft = createSignalObject(uiStructureUnassignedOptionValue)
  const membershipOverrides = createSignalObject<ReadonlyMap<string, string | null>>(new Map())
  let structureQuerySequence = 0

  /**
   * A successful structure snapshot is authoritative for completed moves,
   * including changes made elsewhere. In-flight moves remain optimistic until
   * their own latest request finishes.
   */
  const membershipOverridesReconcile = (_structure: UiAssetStructure, sequence: number) => {
    if (sequence !== structureQuerySequence) return
    const pending = pendingAssetIds.get()
    const next = new Map(membershipOverrides.get())
    for (const assetId of next.keys()) {
      if (!pending.has(assetId)) next.delete(assetId)
    }
    if (next.size !== membershipOverrides.get().size) membershipOverrides.set(next)
  }

  const query = uiQueryCreate<UiAssetStructure | null>(
    async () => {
      structureQuerySequence += 1
      const sequence = structureQuerySequence
      if (!input.isActive()) return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiAssetStructureRead", client.errorMessage)
      const structure = await client.data.structureRead(input.projectId())
      if (!structure.success) return structure
      const assets = await client.data.assetListRead(input.projectId(), {
        limit: 100,
        include: "history,metadata",
        ...input.filters(),
        ...(input.cursor() === undefined ? {} : { cursor: input.cursor() }),
      })
      if (!assets.success) return assets
      const data = { ...structure.data, assets: [...assets.data.assets], page: assets.data.page }
      membershipOverridesReconcile(data, sequence)
      return { success: true, data }
    },
    {
      cacheKey: () => {
        if (!input.isActive()) return undefined
        const filters = input.filters()
        return uiQueryCacheKeyCreate(
          "asset-structure",
          input.projectId(),
          `class=${filters.class ?? ""}&folder=${filters.folder ?? ""}&search=${filters.search ?? ""}&cursor=${input.cursor() ?? ""}`,
        )
      },
      cacheSchema: v.nullable(uiAssetStructureSchema),
    },
  )

  const folderIdByAssetId = createMemo(() => {
    const data = query.data()
    const next = new Map<string, string | null>()
    if (data === null) return next
    const folderIds = new Set(data.folders.map((folder) => folder.id))
    for (const membership of data.memberships) {
      next.set(membership.assetId, folderIds.has(membership.structureFolderId) ? membership.structureFolderId : null)
    }
    for (const [assetId, folderId] of membershipOverrides.get()) {
      next.set(assetId, folderId === null || folderIds.has(folderId) ? folderId : null)
    }
    return next
  })
  const tree = createMemo(() => {
    const data = query.data()
    if (data === null) return { roots: [], unassigned: [] }
    return uiStructureTreeCreate(data.folders, data.assets, folderIdByAssetId())
  })

  const folderOptions = createMemo(() => uiStructureFolderOptionsRead(tree().roots))

  const clientRead = () => {
    const client = uiApiClientRead()
    return client.success ? client.data : null
  }

  /** Latest move sequence per asset, so a slow earlier response cannot win. */
  const moveSequenceByAssetId = new Map<string, number>()
  let moveSequence = 0

  const pendingAssetIdAdd = (assetId: string) => {
    const next = new Set(pendingAssetIds.get())
    next.add(assetId)
    pendingAssetIds.set(next)
  }
  const pendingAssetIdRemove = (assetId: string) => {
    const next = new Set(pendingAssetIds.get())
    next.delete(assetId)
    pendingAssetIds.set(next)
  }
  const overrideSet = (assetId: string, folderId: string | null) => {
    const next = new Map(membershipOverrides.get())
    next.set(assetId, folderId)
    membershipOverrides.set(next)
  }
  /**
   * Restores only the entry of one asset so concurrent moves of other assets
   * are never reverted by an unrelated failure.
   */
  const overrideRestore = (assetId: string, previous: { hasEntry: boolean; folderId: string | null }) => {
    const next = new Map(membershipOverrides.get())
    if (previous.hasEntry) next.set(assetId, previous.folderId)
    else next.delete(assetId)
    membershipOverrides.set(next)
  }

  const assetMove = (assetId: string, folderId: string | null) => {
    const overrides = membershipOverrides.get()
    const previous = { hasEntry: overrides.has(assetId), folderId: overrides.get(assetId) ?? null }
    moveSequence += 1
    const sequence = moveSequence
    moveSequenceByAssetId.set(assetId, sequence)
    overrideSet(assetId, folderId)
    pendingAssetIdAdd(assetId)
    actionError.set(null)
    void (async () => {
      const client = clientRead()
      const result = client
        ? await client.assetStructureFolderMembershipSet(input.projectId(), assetId, { structureFolderId: folderId })
        : resultErrorCreate("uiAssetStructureAssetMove", "The API client is unavailable")
      const isLatest = moveSequenceByAssetId.get(assetId) === sequence
      if (!isLatest) return
      moveSequenceByAssetId.delete(assetId)
      pendingAssetIdRemove(assetId)
      if (!result.success) {
        overrideRestore(assetId, previous)
        actionError.set(result.errorMessage)
        uiToastAdd({ tone: "negative", title: "Move failed", description: result.errorMessage })
        return
      }
      uiToastAdd({ tone: "positive", title: "Asset moved" })
      // Reloading while other moves are in flight would render their pre-move
      // server state; the last finishing move reloads for all of them.
      if (pendingAssetIds.get().size === 0) query.reload()
    })()
  }

  const folderCreate = async () => {
    // A second submit (double click, Enter while pending) would create a duplicate folder.
    if (isFolderPending.get()) return
    const parent = folderParentDraft.get()
    isFolderPending.set(true)
    actionError.set(null)
    const client = clientRead()
    const result = client
      ? await client.structureFolderCreate(input.projectId(), {
          name: folderNameDraft.get().trim(),
          parentId: parent === uiStructureUnassignedOptionValue ? null : parent,
        })
      : resultErrorCreate("uiAssetStructureFolderCreate", "The API client is unavailable")
    isFolderPending.set(false)
    if (!result.success) {
      actionError.set(result.errorMessage)
      uiToastAdd({ tone: "negative", title: "Folder creation failed", description: result.errorMessage })
      return
    }
    uiToastAdd({ tone: "positive", title: "Folder created" })
    folderNameDraft.set("")
    folderParentDraft.set(uiStructureUnassignedOptionValue)
    input.folderDialogOpenSet(false)
    query.reload()
  }

  return {
    query,
    tree,
    folderOptions,
    isReady: () => query.status() === "ready" && query.data() !== null,
    assetFolderIdRead: (assetId: string) =>
      query.data() === null ? undefined : (folderIdByAssetId().get(assetId) ?? null),
    folderNameDraft,
    folderParentDraft,
    pendingAssetIds: pendingAssetIds.get,
    /** Optimistic membership entries not yet confirmed by a reload. */
    overridesRead: membershipOverrides.get,
    isFolderPending: isFolderPending.get,
    actionError: actionError.get,
    isFolderDialogOpen: input.isFolderDialogOpen,
    folderDialogOpen: () => {
      actionError.set(null)
      input.folderDialogOpenSet(true)
    },
    folderDialogClose: () => input.folderDialogOpenSet(false),
    assetMove,
    folderCreate: () => void folderCreate(),
    nextCursor: () => query.data()?.page.nextCursor ?? null,
    isFirstPage: () => input.cursor() === undefined,
    goToNextPage: () => input.cursorSet(query.data()?.page.nextCursor ?? null),
    goToFirstPage: () => input.cursorSet(null),
  }
}
