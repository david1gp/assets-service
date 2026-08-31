import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

import { createSignalObject } from "#ui/utils/createSignalObject.js"
import type { AssetDetailResponse } from "../src/api-client/assetDetailResponseSchema.js"
import type { Result } from "../src/schemas/resultSchema.js"

type UploadIntentInput = {
  assetId: string
  originalFilename: string
  folders: string[]
  integrationNote: string
  byteSize: number
  mediaType: string
  sha256: string
}

const intentInputs: UploadIntentInput[] = []
const transferredBytes: Uint8Array[] = []
const completionInputs: Array<{ projectId: string; uploadId: string; sha256: string }> = []
let intentRead = (_projectId: string, input: unknown) =>
  Promise.resolve({
    success: true as const,
    data: {
      uploadId: "upload-replacement",
      status: "pending" as const,
      intent: {
        url: "https://storage.example/upload",
        method: "PUT" as const,
        byteSize: 3,
        mediaType: "image/jpeg",
      },
    },
  })
let transferRead: (_intent: unknown, bytes: Uint8Array) => Promise<Result<true>> = async (_intent, bytes) => {
  transferredBytes.push(bytes)
  return { success: true as const, data: true as const }
}
let completionRead = (_projectId: string, _uploadId: string, _input: unknown) =>
  Promise.resolve({
    success: true as const,
    data: {
      uploadId: "upload-replacement",
      assetId: "asset-current",
      sourceRevisionId: "source-replacement",
      workflowId: "workflow-replacement",
      status: "accepted" as const,
    },
  })

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true as const,
    data: {
      uploadIntentCreate: async (projectId: string, input: unknown) => {
        intentInputs.push(input as UploadIntentInput)
        return intentRead(projectId, input)
      },
      uploadObjectPut: (intent: unknown, bytes: Uint8Array) => transferRead(intent, bytes),
      uploadCompletionComplete: async (projectId: string, uploadId: string, input: unknown) => {
        const completion = input as { sha256: string }
        completionInputs.push({ projectId, uploadId, sha256: completion.sha256 })
        return completionRead(projectId, uploadId, input)
      },
    },
  }),
}))

const { uiAssetDetailReplacementUploadStateCreate } = await import(
  "../src/ui/pages/uiAssetDetailReplacementUploadStateCreate.js"
)

const assetCreate = (overrides: Partial<AssetDetailResponse> = {}): AssetDetailResponse => ({
  id: "asset-current",
  projectId: "project-1",
  class: "image",
  folders: ["brand", "hero"],
  filename: "hero.jpg",
  basename: "hero",
  currentSourceRevisionId: "source-current",
  integrationNote: "Keep the hero image",
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  sourcePath: "brand/hero/hero.jpg",
  sourceHistory: [],
  outputHistory: [],
  metadata: null,
  ...overrides,
})

const fileCreate = (name = "replacement.jpg", type = "image/jpeg") =>
  new File([new Uint8Array([1, 2, 3])], name, { type })

const stateCreate = (asset: AssetDetailResponse | null = assetCreate()) => {
  const assetSignal = createSignalObject<AssetDetailResponse | null>(asset)
  let refreshCount = 0
  let dispose = () => {}
  const state = createRoot((disposeRoot) => {
    dispose = disposeRoot
    return uiAssetDetailReplacementUploadStateCreate({
      projectId: () => "project-1",
      assetId: () => "asset-current",
      asset: assetSignal.get,
      refresh: () => {
        refreshCount += 1
      },
    })
  })
  return { state, assetSignal, refreshCountRead: () => refreshCount, dispose }
}

const resetMocks = () => {
  intentInputs.length = 0
  transferredBytes.length = 0
  completionInputs.length = 0
  intentRead = (_projectId, _input) =>
    Promise.resolve({
      success: true as const,
      data: {
        uploadId: "upload-replacement",
        status: "pending" as const,
        intent: {
          url: "https://storage.example/upload",
          method: "PUT" as const,
          byteSize: 3,
          mediaType: "image/jpeg",
        },
      },
    })
  transferRead = async (_intent, bytes) => {
    transferredBytes.push(bytes)
    return { success: true as const, data: true as const }
  }
  completionRead = (_projectId, _uploadId, _input) =>
    Promise.resolve({
      success: true as const,
      data: {
        uploadId: "upload-replacement",
        assetId: "asset-current",
        sourceRevisionId: "source-replacement",
        workflowId: "workflow-replacement",
        status: "accepted" as const,
      },
    })
}

const flush = async () => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

test("uploads a replacement against the current asset and refreshes detail activity", async () => {
  resetMocks()
  const { state, refreshCountRead, dispose } = stateCreate()
  const file = fileCreate()

  expect(state.acceptAttribute).toContain("image/jpeg")
  expect(state.canSubmit()).toBe(false)
  state.selectFile(file)
  expect(state.fileError()).toBeNull()
  expect(state.canSubmit()).toBe(true)

  await state.submit()

  expect(intentInputs).toHaveLength(1)
  expect(intentInputs[0]).toMatchObject({
    assetId: "asset-current",
    originalFilename: "replacement.jpg",
    folders: ["brand", "hero"],
    integrationNote: "Keep the hero image",
    byteSize: 3,
    mediaType: "image/jpeg",
    sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  })
  expect(transferredBytes).toEqual([new Uint8Array([1, 2, 3])])
  expect(completionInputs).toEqual([
    {
      projectId: "project-1",
      uploadId: "upload-replacement",
      sha256: intentInputs[0]!.sha256,
    },
  ])
  expect(state.stage()).toBe("done")
  expect(state.progress().percent).toBe(100)
  expect(state.errorMessage()).toBeNull()
  expect(state.isBusy()).toBe(false)
  expect(state.canSubmit()).toBe(true)
  expect(refreshCountRead()).toBe(1)

  state.reset()
  expect(state.file.get()).toBeNull()
  expect(state.stage()).toBe("idle")
  expect(state.errorMessage()).toBeNull()
  expect(state.canSubmit()).toBe(false)
  dispose()
})

test("tracks busy progress and prevents a second replacement while transferring", async () => {
  resetMocks()
  let releaseTransfer: (() => void) | undefined
  transferRead = async (_intent, bytes) => {
    transferredBytes.push(bytes)
    await new Promise<void>((resolve) => {
      releaseTransfer = resolve
    })
    return { success: true as const, data: true as const }
  }
  const { state, dispose } = stateCreate()
  state.selectFile(fileCreate())
  const upload = state.submit()
  await flush()

  expect(state.stage()).toBe("transferring")
  expect(state.progress().percent).toBe(55)
  expect(state.isBusy()).toBe(true)
  expect(state.canSubmit()).toBe(false)
  expect(intentInputs).toHaveLength(1)

  await state.submit()
  expect(intentInputs).toHaveLength(1)

  releaseTransfer?.()
  await upload
  expect(state.stage()).toBe("done")
  dispose()
})

test("surfaces file and upload errors and clears them when reset or selecting another file", async () => {
  resetMocks()
  const { state, dispose } = stateCreate()
  state.selectFile(fileCreate("logo.svg", "image/svg+xml"))

  expect(state.canSubmit()).toBe(false)
  expect(state.fileError()).toContain("not allowed")
  await state.submit()
  expect(state.stage()).toBe("failed")
  expect(state.errorMessage()).toContain("not allowed")

  state.selectFile(fileCreate())
  expect(state.stage()).toBe("idle")
  expect(state.errorMessage()).toBeNull()

  transferRead = async () => ({ success: false as const, op: "upload", errorMessage: "storage unavailable" })
  await state.submit()
  expect(state.stage()).toBe("failed")
  expect(state.errorMessage()).toBe("storage unavailable")
  expect(state.isBusy()).toBe(false)
  state.reset()
  expect(state.file.get()).toBeNull()
  expect(state.errorMessage()).toBeNull()
  dispose()
})
