import { createSignalObject } from "#ui/utils/createSignalObject.js"

export type UiProjectRouteStoreValue = {
  organizationSlug: string
  projectSlug: string
  projectId: string
}

/** Holds the resolved project route context for shell and page link generation. */
export const uiProjectRouteStore = createSignalObject<UiProjectRouteStoreValue | null>(null)
