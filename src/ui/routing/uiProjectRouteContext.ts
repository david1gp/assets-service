import type { Accessor } from "solid-js"
import { createContext } from "solid-js"
import type { Project } from "../../project/projectSchema.js"

type UiProjectRouteContextValue = {
  project: Accessor<Project>
  projectId: Accessor<string>
  organizationSlug: Accessor<string>
  projectSlug: Accessor<string>
}

const context = createContext<UiProjectRouteContextValue>()

export { context as uiProjectRouteContext }
