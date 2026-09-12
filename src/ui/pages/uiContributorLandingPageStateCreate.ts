import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { uiPaths } from "../routing/uiPaths.js"
import { uiProjectRouteContextRead } from "../routing/uiProjectRouteContextRead.js"

/** Resolves the two customer operations for the current contributor project. */
export const uiContributorLandingPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const route = uiProjectRouteContextRead()
  const projectId = createMemo(() => route?.projectId() ?? params.projectId)

  return {
    uploadPath: () => uiPaths.contributor.upload(projectId()),
    assetsPath: () => uiPaths.contributor.assets(projectId()),
  }
}
