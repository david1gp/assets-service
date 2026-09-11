import { ttc } from "../localization/ttc.js"

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

const stageLabelRead = (stage: UiUploadStage): string => {
  if (stage === "idle") return ttc("Waiting for a file", "Warten auf eine Datei")
  if (stage === "hashing") return ttc("Checksumming the file", "Datei wird geprüft")
  if (stage === "requesting") return ttc("Requesting an upload slot", "Upload-Platz wird angefordert")
  if (stage === "transferring") return ttc("Transferring to storage", "Übertragung in den Speicher")
  if (stage === "completing") return ttc("Registering the asset", "Medium wird erfasst")
  if (stage === "done") return ttc("Upload finished", "Upload abgeschlossen")
  return ttc("Upload failed", "Upload fehlgeschlagen")
}

/** Maps an upload stage to its progress percentage and status label. */
export const uiUploadStageProgressRead = (stage: UiUploadStage): { percent: number; label: string } => ({
  percent: stageProgress[stage],
  label: stageLabelRead(stage),
})
