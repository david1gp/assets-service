import type { UiUploadStage } from "./uiUploadStageProgressRead.js"

/** One file tracked by the multi-file upload state: its transfer stage and canonical folders. */
export type UiUploadMultiFileItem = {
  id: string
  file: File
  folders: string[]
  canonicalFolders: string[]
  stage: UiUploadStage
  progress: { percent: number; label: string }
  errorMessage: string | null
  folderErrorMessage: string | null
  folderMovePending: boolean
  uploadId: string | null
  assetId: string | null
  workflowId: string | null
  uploadStatus: string | null
  workflowStatus: string | null
}
