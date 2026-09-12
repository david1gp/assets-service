import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectRouteContextRead } from "../routing/uiProjectRouteContextRead.js"
import { uiProjectRouteModeRead } from "../routing/uiProjectRouteModeRead.js"
import { uiUploadAcceptAttributeRead } from "../upload/uiUploadAcceptAttributeRead.js"
import { uiUploadMultiFileStateCreate } from "./uiUploadMultiFileStateCreate.js"

/** Drives the multi-file upload page: route context plus immediate per-file uploads. */
export const uiUploadPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const route = uiProjectRouteContextRead()
  const location = useLocation()

  const projectId = createMemo(() => route?.projectId() ?? params.projectId)
  const mode = createMemo(() => uiProjectRouteModeRead(location.pathname) ?? "admin")
  const paths = createMemo(() => uiPaths[mode()])
  const uploads = uiUploadMultiFileStateCreate({ projectId })

  return {
    projectId,
    mode,
    paths,
    acceptAttribute: uiUploadAcceptAttributeRead(),
    files: uploads.files,
    folderOptions: uploads.folderOptions,
    hasActiveUploads: uploads.hasActiveUploads,
    selectFiles: uploads.selectFiles,
    setFileFolder: (fileId: string, level: 1 | 2 | 3, value: string) =>
      void uploads.setFileFolder(fileId, level, value),
    clear: uploads.clear,
    assetHref: (assetId: string) => paths().asset(projectId(), assetId),
    jobsHref: () => uiPaths.admin.jobs(projectId()),
  }
}
