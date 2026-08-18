export type UiUploadStage = "idle" | "hashing" | "requesting" | "transferring" | "completing" | "done" | "failed"

const stageProgress: Readonly<Record<UiUploadStage, number>> = {
  idle: 0,
  hashing: 10,
  requesting: 25,
  transferring: 55,
  completing: 85,
  done: 100,
  failed: 100,
}

const stageLabels: Readonly<Record<UiUploadStage, string>> = {
  idle: "Waiting for a file",
  hashing: "Checksumming the file",
  requesting: "Requesting an upload slot",
  transferring: "Transferring to storage",
  completing: "Registering the asset",
  done: "Upload finished",
  failed: "Upload failed",
}

/** Maps an upload stage to its progress percentage and status label. */
export const uiUploadStageProgressRead = (stage: UiUploadStage): { percent: number; label: string } => ({
  percent: stageProgress[stage],
  label: stageLabels[stage],
})
