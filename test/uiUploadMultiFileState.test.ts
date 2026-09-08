import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

const intentInputs: Array<Record<string, unknown>> = []
const moves: Array<Record<string, unknown>> = []
let transferRead: (
  name: string,
) => Promise<{ success: true; data: true } | { success: false; errorMessage: string; op: string }> = async () => ({
  success: true,
  data: true,
})

mock.module("../src/ui/client/uiApiClientRead.js", () => ({
  uiApiClientRead: () => ({
    success: true as const,
    data: {
      assetsReadAll: async () => ({
        success: true as const,
        data: [{ folders: ["media", "hero"] }, { folders: ["media", "icons"] }, { folders: ["documents"] }],
      }),
      uploadIntentCreate: async (_projectId: string, input: Record<string, unknown>) => {
        intentInputs.push(input)
        return {
          success: true as const,
          data: {
            uploadId: `upload-${String(input.originalFilename)}`,
            status: "pending" as const,
            intent: {
              url: "https://storage.example/upload",
              method: "PUT" as const,
              byteSize: 1,
              mediaType: "image/png",
            },
          },
        }
      },
      uploadObjectPut: (_intent: unknown, _bytes: Uint8Array) =>
        transferRead(String(intentInputs.at(-1)?.originalFilename)),
      uploadCompletionComplete: async (_projectId: string, uploadId: string) => ({
        success: true as const,
        data: {
          uploadId,
          assetId: `asset-${uploadId}`,
          sourceRevisionId: "source-1",
          workflowId: `workflow-${uploadId}`,
          status: "accepted" as const,
        },
      }),
      assetMove: async (_projectId: string, assetId: string, input: Record<string, unknown>) => {
        moves.push({ assetId, ...input })
        return { success: true as const, data: {} }
      },
    },
  }),
}))

const { uiUploadMultiFileStateCreate } = await import("../src/ui/pages/uiUploadMultiFileStateCreate.js")

const flush = async () => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

const fileCreate = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" })

test("uploads files independently, uses required filename notes, and moves completed files", async () => {
  intentInputs.length = 0
  moves.length = 0
  transferRead = async (name) =>
    name === "failed.png"
      ? { success: false, op: "transfer", errorMessage: "storage unavailable" }
      : { success: true, data: true }

  let dispose = () => {}
  const state = createRoot((disposeRoot) => {
    dispose = disposeRoot
    return uiUploadMultiFileStateCreate({ projectId: () => "project-1" })
  })
  const ids = state.selectFiles([fileCreate("ready.png"), fileCreate("failed.png")])
  expect(ids).toHaveLength(2)
  await flush()

  expect(state.files()).toHaveLength(2)
  expect(state.files()[0]?.stage).toBe("done")
  expect(state.files()[0]?.progress.percent).toBe(100)
  expect(state.files()[1]?.stage).toBe("failed")
  expect(state.files()[1]?.errorMessage).toBe("storage unavailable")
  expect(intentInputs.map((input) => input.integrationNote)).toEqual(["Upload ready.png", "Upload failed.png"])

  await state.setFileFolder(ids[0]!, 1, "media")
  expect(moves).toEqual([{ assetId: "asset-upload-ready.png", folders: ["media"], filename: "ready.png" }])
  await state.setFileFolder(ids[0]!, 2, "hero")
  await state.setFileFolder(ids[0]!, 1, "")
  expect(state.files()[0]?.folders).toEqual(["", "", ""])
  expect(moves).toHaveLength(3)
  expect(state.folderOptions(1)).toEqual(["documents", "media"])
  expect(state.folderOptions(2, "media")).toEqual(["hero", "icons"])
  expect(state.folderOptions(3, "media", "hero")).toEqual([])

  const repeatedId = state.selectFile(fileCreate("ready.png"))[0]
  expect(repeatedId).not.toBe(ids[0])
  await flush()
  expect(state.files()).toHaveLength(3)
  dispose()
})
