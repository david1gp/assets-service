import { uiSessionStore } from "../session/uiSessionStore.js"

/** Creates an authenticated, entity-scoped localStorage key for a remote read. */
export const uiQueryCacheKeyCreate = (entity: string, subject: string, variant = "default"): string | undefined => {
  const principal = uiSessionStore.get().principal
  if (principal === null) return undefined
  return ["assets-service", "ui-cache", entity, principal.organizationId, principal.subjectId, subject, variant]
    .map(encodeURIComponent)
    .join(":")
}
