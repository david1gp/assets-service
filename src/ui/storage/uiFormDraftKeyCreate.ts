import { uiSessionStore } from "../session/uiSessionStore.js"

/** Creates an authenticated, entity- and form-instance-scoped localStorage key. */
export const uiFormDraftKeyCreate = (entity: string, entityId: string, formInstance: string): string | undefined => {
  const principal = uiSessionStore.get().principal
  if (principal === null) return undefined
  return ["assets-service", "ui-draft", entity, principal.organizationId, principal.subjectId, entityId, formInstance]
    .map(encodeURIComponent)
    .join(":")
}
