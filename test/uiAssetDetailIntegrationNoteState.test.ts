import { describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { AssetDetailResponse } from "../src/api-client/assetDetailResponseSchema.js"
import type { Result } from "../src/schemas/resultSchema.js"

type IntegrationNoteCall = { projectId: string; assetId: string; input: unknown }
const integrationNoteCalls: IntegrationNoteCall[] = []
let integrationNoteResult: Result<AssetDetailResponse> = {
  success: true,
  data: {
    id: "asset-1",
    projectId: "project-1",
    class: "image",
    folders: [],
    filename: "hero.png",
    basename: "hero",
    currentSourceRevisionId: "source-1",
    integrationNote: "Saved note",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    sourcePath: "hero.png",
    sourceHistory: [],
    outputHistory: [],
    metadata: null,
  },
}

const assetDetailFixture: AssetDetailResponse = {
  id: "asset-1",
  projectId: "project-1",
  class: "image",
  folders: [],
  filename: "hero.png",
  basename: "hero",
  currentSourceRevisionId: "source-1",
  integrationNote: "Initial note",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  sourcePath: "hero.png",
  sourceHistory: [],
  outputHistory: [],
  metadata: null,
}

let assetDetailResult: Result<AssetDetailResponse> = {
  success: true,
  data: assetDetailFixture,
}

mock.module("@solidjs/router", () => ({
  useLocation: () => ({ pathname: "/projects/project-1/assets/asset-1" }),
  useNavigate: () => () => {},
  useParams: () => ({ projectId: "project-1", assetId: "asset-1" }),
  useSearchParams: () => [{}, () => {}],
}))

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true,
    data: {
      assetRead: () => Promise.resolve(assetDetailResult),
      assetIntegrationNoteSet: (projectId: string, assetId: string, input: unknown) => {
        integrationNoteCalls.push({ projectId, assetId, input })
        return Promise.resolve(integrationNoteResult)
      },
      assetMetadataSet: () => Promise.resolve({ success: true, data: {} }),
      assetMetadataUnset: () => Promise.resolve({ success: true, data: {} }),
      projectRead: () => Promise.resolve({ success: true, data: { defaultEnvironment: "prod" } }),
      environmentsRead: () => Promise.resolve({ success: true, data: { environments: [] } }),
      workflowListRead: () => Promise.resolve({ success: true, data: { workflows: [] } }),
      backupListRead: () => Promise.resolve({ success: true, data: { receipts: [] } }),
      deletionStatusOptionalRead: () => Promise.resolve({ success: true, data: null }),
      assetSourceRevisionContentUrlCreate: () => "https://example.test/source",
      assetOutputVersionContentUrlCreate: () => "https://example.test/output",
    },
  }),
}))

const { uiContributorAssetDetailPageStateCreate } = await import(
  "../src/ui/pages/uiContributorAssetDetailPageStateCreate.js"
)
const { uiAssetDetailPageStateCreate } = await import("../src/ui/pages/uiAssetDetailPageStateCreate.js")

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

const stateCreate = <T>(create: () => T) =>
  createRoot((dispose) => ({
    state: create(),
    dispose,
  }))

describe("uiContributorAssetDetailPageStateCreate integration note", () => {
  test("initializes draft and saves via assetIntegrationNoteSet", async () => {
    integrationNoteCalls.length = 0
    const { state, dispose } = stateCreate(uiContributorAssetDetailPageStateCreate)

    await flush()

    expect(state.integrationNoteDraft.get()).toBe("Initial note")

    state.integrationNoteDraft.set("Updated contributor note")
    await state.integrationNoteSave()

    expect(integrationNoteCalls).toHaveLength(1)
    expect(integrationNoteCalls[0]).toEqual({
      projectId: "project-1",
      assetId: "asset-1",
      input: { integrationNote: "Updated contributor note" },
    })
    expect(state.actionError()).toBe(null)
    dispose()
  })

  test("handles save errors gracefully", async () => {
    integrationNoteCalls.length = 0
    integrationNoteResult = {
      success: false,
      op: "assetIntegrationNoteSet",
      errorMessage: "Project not accessible",
    }

    const { state, dispose } = stateCreate(uiContributorAssetDetailPageStateCreate)

    await flush()

    state.integrationNoteDraft.set("Failed note")
    await state.integrationNoteSave()

    expect(state.actionError()).toBe("Project not accessible")

    // Restore for other tests
    integrationNoteResult = {
      success: true,
      data: assetDetailFixture,
    }
    dispose()
  })

  test("handles missing note gracefully and initializes to empty string", async () => {
    assetDetailResult = {
      success: true,
      data: {
        ...assetDetailFixture,
        integrationNote: undefined,
      },
    }

    const { state, dispose } = stateCreate(uiContributorAssetDetailPageStateCreate)

    await flush()

    expect(state.integrationNoteDraft.get()).toBe("")
    dispose()
  })
})

describe("uiAssetDetailPageStateCreate integration note", () => {
  test("initializes draft and saves via assetIntegrationNoteSet", async () => {
    assetDetailResult = {
      success: true,
      data: {
        ...assetDetailFixture,
        integrationNote: "Initial note",
      },
    }
    integrationNoteCalls.length = 0
    const { state, dispose } = stateCreate(uiAssetDetailPageStateCreate)

    await flush()

    expect(state.integrationNoteDraft.get()).toBe("Initial note")

    state.integrationNoteDraft.set("Updated admin note")
    await state.integrationNoteSet()

    expect(integrationNoteCalls).toHaveLength(1)
    expect(integrationNoteCalls[0]).toEqual({
      projectId: "project-1",
      assetId: "asset-1",
      input: { integrationNote: "Updated admin note" },
    })
    expect(state.actionError()).toBe(null)
    dispose()
  })

  test("handles missing note gracefully and initializes to empty string", async () => {
    assetDetailResult = {
      success: true,
      data: {
        ...assetDetailFixture,
        integrationNote: undefined,
      },
    }

    const { state, dispose } = stateCreate(uiAssetDetailPageStateCreate)

    await flush()

    expect(state.integrationNoteDraft.get()).toBe("")
    dispose()
  })
})
