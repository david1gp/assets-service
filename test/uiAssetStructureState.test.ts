import { expect, mock, test } from "bun:test"

import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AssetListItem } from "../src/api-client/assetListItemSchema.js"
import type { AssetListQuery } from "../src/api-client/assetListQuerySchema.js"
import type { AssetStructureFolderMembership } from "../src/structure/assetStructureFolderMembershipSchema.js"
import type { StructureFolder } from "../src/structure/structureFolderSchema.js"

/**
 * Behavioral suite for the optimistic membership state. The concrete regressions
 * are a single shared pending id and a whole-map rollback, both of which corrupt
 * the board as soon as two assets move at the same time or one request fails.
 */

type MoveCall = {
  assetId: string
  structureFolderId: string | null
  resolve: (result: { success: true; data: unknown } | { success: false; errorMessage: string }) => void
}

const moveCalls: MoveCall[] = []
const folderCreateCalls: Array<{ name: string; parentId: string | null; resolve: () => void }> = []
const assetListCalls: Array<Record<string, unknown>> = []
let serverMemberships: AssetStructureFolderMembership[] = []
let serverAssets: AssetListItem[] = []
let serverFolders: StructureFolder[] = []
let serverNextCursor: string | null = null

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      structureRead: async () => ({ success: true, data: { folders: serverFolders, memberships: serverMemberships } }),
      assetListRead: async (_projectId: string, query: Record<string, unknown>) => {
        assetListCalls.push(query)
        return { success: true, data: { assets: serverAssets, page: { limit: 100, nextCursor: serverNextCursor } } }
      },
      assetStructureFolderMembershipSet: (
        _projectId: string,
        assetId: string,
        body: { structureFolderId: string | null },
      ) =>
        new Promise((resolve) => {
          moveCalls.push({ assetId, structureFolderId: body.structureFolderId, resolve })
        }),
      structureFolderCreate: (_projectId: string, body: { name: string; parentId: string | null }) =>
        new Promise((resolve) => {
          folderCreateCalls.push({
            name: body.name,
            parentId: body.parentId,
            resolve: () => resolve({ success: true, data: { id: "folder-new" } }),
          })
        }),
    },
  }),
}))

const { createRoot } = await import("solid-js")
const { uiAssetStructureStateCreate } = await import("../src/ui/structure/uiAssetStructureStateCreate.js")

const stateCreate = (
  isActive = false,
  options: { cursor?: number; filters?: Pick<AssetListQuery, "class" | "folder" | "search"> } = {},
) => {
  const dialogOpen = createSignalObject(false)
  const cursor = createSignalObject<number | undefined>(options.cursor)
  const cursorChanges: Array<string | null> = []
  let dispose = () => {}
  const state = createRoot((disposeRoot) => {
    dispose = disposeRoot
    return uiAssetStructureStateCreate({
      projectId: () => "project-1",
      // Inactive keeps the read out of the way for mutation-only tests.
      isActive: () => isActive,
      filters: () => options.filters ?? {},
      cursor: cursor.get,
      cursorSet: (nextCursor) => cursorChanges.push(nextCursor),
      isFolderDialogOpen: dialogOpen.get,
      folderDialogOpenSet: dialogOpen.set,
    })
  })
  return { state, dialogOpen, dispose, cursorChanges }
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const reset = () => {
  moveCalls.length = 0
  folderCreateCalls.length = 0
  assetListCalls.length = 0
  serverMemberships = []
  serverAssets = []
  serverFolders = []
  serverNextCursor = null
}

const membershipCreate = (assetId: string, structureFolderId: string): AssetStructureFolderMembership => ({
  id: `membership-${assetId}`,
  assetId,
  structureFolderId,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

const assetCreate = (id: string): AssetListItem =>
  ({
    id,
    projectId: "project-1",
    class: "image",
    folders: [],
    filename: `${id}.jpg`,
    basename: id,
    currentSourceRevisionId: `source-${id}`,
    sourcePath: `/${id}.jpg`,
    outputCount: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }) as AssetListItem

const folderCreate = (id: string): StructureFolder => ({
  id,
  projectId: "project-1",
  parentId: null,
  name: id,
  depth: 1,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

test("tracks pending state per asset while several assets move concurrently", async () => {
  reset()
  const { state, dispose } = stateCreate()

  state.assetMove("asset-a", "folder-1")
  state.assetMove("asset-b", "folder-2")
  expect(state.pendingAssetIds()).toEqual(new Set(["asset-a", "asset-b"]))

  moveCalls[0]?.resolve({ success: true, data: null })
  await flush()
  // The second asset is still in flight and must keep its pending marker.
  expect(state.pendingAssetIds()).toEqual(new Set(["asset-b"]))

  moveCalls[1]?.resolve({ success: true, data: null })
  await flush()
  expect(state.pendingAssetIds()).toEqual(new Set())

  dispose()
})

test("reverts only the failed asset and keeps the concurrent successful move", async () => {
  reset()
  const { state, dispose } = stateCreate()

  state.assetMove("asset-a", "folder-1")
  state.assetMove("asset-b", "folder-2")

  // `asset-a` fails after `asset-b` already succeeded. A whole-map rollback
  // would drop the `asset-b` override and snap that asset back visually.
  moveCalls[1]?.resolve({ success: true, data: null })
  await flush()
  moveCalls[0]?.resolve({ success: false, errorMessage: "boom" })
  await flush()

  expect(state.overridesRead()).toEqual(new Map([["asset-b", "folder-2"]]))
  expect(state.actionError()).toBe("boom")
  expect(state.pendingAssetIds()).toEqual(new Set())

  dispose()
})

test("keeps only the latest move of one asset when an earlier request resolves last", async () => {
  reset()
  const { state, dispose } = stateCreate()

  state.assetMove("asset-a", "folder-1")
  state.assetMove("asset-a", "folder-2")
  expect(state.pendingAssetIds()).toEqual(new Set(["asset-a"]))

  // The superseded first request fails late; it must not revert or clear the
  // newer move that is still pending.
  moveCalls[0]?.resolve({ success: false, errorMessage: "stale" })
  await flush()
  expect(state.overridesRead()).toEqual(new Map([["asset-a", "folder-2"]]))
  expect(state.actionError()).toBe(null)
  expect(state.pendingAssetIds()).toEqual(new Set(["asset-a"]))

  moveCalls[1]?.resolve({ success: true, data: null })
  await flush()
  expect(state.overridesRead()).toEqual(new Map([["asset-a", "folder-2"]]))
  expect(state.pendingAssetIds()).toEqual(new Set())

  dispose()
})

test("restores a failed move to the previous optimistic folder rather than to unassigned", async () => {
  reset()
  const { state, dispose } = stateCreate()

  state.assetMove("asset-a", "folder-1")
  moveCalls[0]?.resolve({ success: true, data: null })
  await flush()

  state.assetMove("asset-a", "folder-2")
  moveCalls[1]?.resolve({ success: false, errorMessage: "boom" })
  await flush()

  expect(state.overridesRead()).toEqual(new Map([["asset-a", "folder-1"]]))

  dispose()
})

test("clears a completed optimistic membership after a successful reload", async () => {
  reset()
  serverAssets = [assetCreate("asset-a")]
  const { state, dispose } = stateCreate(true)
  await flush()

  state.assetMove("asset-a", "folder-optimistic")
  serverMemberships = [membershipCreate("asset-a", "folder-optimistic")]
  moveCalls[0]?.resolve({ success: true, data: null })
  await flush()

  expect(state.overridesRead()).toEqual(new Map())

  dispose()
})

test("shows an external membership change after a reload", async () => {
  reset()
  const asset = assetCreate("asset-a")
  serverAssets = [asset]
  serverFolders = [folderCreate("folder-server"), folderCreate("folder-external")]
  serverMemberships = [membershipCreate("asset-a", "folder-server")]
  const { state, dispose } = stateCreate(true)
  await flush()

  state.assetMove("asset-a", "folder-optimistic")
  serverMemberships = [membershipCreate("asset-a", "folder-optimistic")]
  moveCalls[0]?.resolve({ success: true, data: null })
  await flush()

  serverMemberships = [membershipCreate("asset-a", "folder-external")]
  state.query.reload()
  await flush()

  expect(state.overridesRead()).toEqual(new Map())
  expect(state.tree().roots.find((node) => node.folder.id === "folder-external")?.assets).toEqual([asset])

  dispose()
})

test("retains a pending optimistic membership when a reload returns older server data", async () => {
  reset()
  serverAssets = [assetCreate("asset-a")]
  serverMemberships = [membershipCreate("asset-a", "folder-server")]
  const { state, dispose } = stateCreate(true)
  await flush()

  state.assetMove("asset-a", "folder-pending")
  state.query.reload()
  await flush()

  expect(state.overridesRead()).toEqual(new Map([["asset-a", "folder-pending"]]))
  expect(state.pendingAssetIds()).toEqual(new Set(["asset-a"]))

  dispose()
})

test("reads the authoritative and optimistic membership for list assignments", async () => {
  reset()
  serverAssets = [assetCreate("asset-a")]
  serverFolders = [folderCreate("folder-server"), folderCreate("folder-optimistic")]
  serverMemberships = [membershipCreate("asset-a", "folder-server")]
  const { state, dispose } = stateCreate(true)
  await flush()

  expect(state.isReady()).toBe(true)
  expect(state.assetFolderIdRead("asset-a")).toBe("folder-server")
  expect(state.assetFolderIdRead("asset-unassigned")).toBe(null)

  state.assetMove("asset-a", "folder-optimistic")
  expect(state.assetFolderIdRead("asset-a")).toBe("folder-optimistic")

  moveCalls[0]?.resolve({ success: false, errorMessage: "boom" })
  await flush()

  expect(state.assetFolderIdRead("asset-a")).toBe("folder-server")
  dispose()
})

test("loads one filtered asset page and navigates with its response cursor", async () => {
  reset()
  serverAssets = [assetCreate("asset-a")]
  serverNextCursor = "100"
  const { state, cursorChanges, dispose } = stateCreate(true, {
    cursor: 100,
    filters: { class: "image", folder: "images", search: "hero" },
  })
  await flush()

  expect(assetListCalls).toHaveLength(1)
  expect(assetListCalls[0]).toEqual({
    limit: 100,
    include: "history,metadata",
    class: "image",
    folder: "images",
    search: "hero",
    cursor: 100,
  })
  expect(state.tree().unassigned).toEqual(serverAssets)
  expect(state.nextCursor()).toBe("100")
  expect(state.isFirstPage()).toBe(false)

  state.goToNextPage()
  state.goToFirstPage()
  expect(cursorChanges).toEqual(["100", null])

  dispose()
})

test("submits folder creation once while a request is still pending", async () => {
  reset()
  const { state, dispose } = stateCreate()

  state.folderNameDraft.set("logos")
  state.folderCreate()
  state.folderCreate()
  state.folderCreate()
  await flush()

  expect(folderCreateCalls).toHaveLength(1)
  expect(state.isFolderPending()).toBe(true)

  folderCreateCalls[0]?.resolve()
  await flush()
  expect(state.isFolderPending()).toBe(false)

  // A later submit is allowed again once the first one finished.
  state.folderNameDraft.set("icons")
  state.folderCreate()
  await flush()
  expect(folderCreateCalls).toHaveLength(2)

  dispose()
})

test("disables the submit control and guards the form while a folder create is pending", async () => {
  const view = await Bun.file("src/ui/structure/UiAssetStructureView.tsx").text()

  expect(view).toContain("if (p.state.isFolderPending()) return")
  expect(view).toContain("disabled={p.state.isFolderPending()}")
})
